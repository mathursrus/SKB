// ============================================================================
// SKB - Owner signup service (issue #54)
// ============================================================================
//
// Provisions a brand-new restaurant in one call:
//   - derives a unique slug from the restaurant name (with city + integer suffixes
//     when collisions happen)
//   - inserts a Location row with default websiteTemplate='saffron' and an
//     auto-generated 4-digit host PIN
//   - delegates to services/users.createOwnerUser to insert the User + Membership
//   - returns the freshly-minted row so the route can mint cookies and emit
//     the welcome email
//
// Slug strategy (spec §16 "Open questions" / §6.1):
//   1. Base slug = kebab-case(restaurantName) (lowercase, ascii, dashes for
//      non-alphanumerics, collapsed).
//   2. If the base slug is taken, try `<base>-<city-slug>`.
//   3. If that's also taken, append -2, -3, ... until we find an unused slug.
//
// Atomicity: the Location is inserted FIRST. If the subsequent User/Membership
// insert fails (e.g. duplicate email), we roll the Location back so the slug
// stays free and the owner can re-try. This keeps the signup endpoint
// idempotent from the user's perspective: either everything succeeded or
// nothing did.
// ============================================================================

import { randomInt } from 'node:crypto';

import { getDb, locations } from '../core/db/mongo.js';
import { createOwnerUser, validateEmail, validatePassword, validateName } from './users.js';
import type { Location } from '../types/queue.js';
import type { PublicUser, PublicMembership } from '../types/identity.js';

const DEFAULT_WEBSITE_TEMPLATE = 'saffron';
const MAX_RESTAURANT_NAME_LEN = 80;
const MIN_RESTAURANT_NAME_LEN = 2;
const MAX_CITY_LEN = 80;
const MAX_SLUG_ATTEMPTS = 99;

export interface OwnerSignupInput {
    restaurantName: string;
    city: string;
    ownerName: string;
    email: string;
    password: string;
    // Optional slug override — when present, we use exactly this slug (after
    // normalization) and reject if it's already taken.
    slug?: string;
}

export interface OwnerSignupResult {
    location: {
        id: string;
        name: string;
        websiteTemplate: string;
        onboardingSteps: string[];
        createdAt: Date;
    };
    // The host PIN is returned here ONCE so the signup page can show it to the
    // owner. We never return it from any other endpoint.
    hostPin: string;
    user: PublicUser;
    membership: PublicMembership;
}

export class SignupValidationError extends Error {
    field: string;
    constructor(field: string, message: string) {
        super(message);
        this.field = field;
        this.name = 'SignupValidationError';
    }
}

export class SignupConflictError extends Error {
    field: string;
    constructor(field: string, message: string) {
        super(message);
        this.field = field;
        this.name = 'SignupConflictError';
    }
}

/**
 * Kebab-case a free-text string into a slug-safe token.
 *
 *   "Ramen Yokocho"     → "ramen-yokocho"
 *   "The Corner Café"   → "the-corner-cafe"
 *   "  A&B "            → "a-b"
 *   "--weird--"         → "weird"
 *
 * Handles common diacritics via NFKD normalization + combining-mark strip.
 * Returns an empty string if the input has no alphanumeric characters.
 */
export function kebabCase(input: string): string {
    const norm = String(input ?? '')
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '') // combining marks
        .toLowerCase();
    let out = '';
    let lastDash = true;
    for (const ch of norm) {
        const code = ch.charCodeAt(0);
        const isAlnum =
            (code >= 48 && code <= 57) || // 0-9
            (code >= 97 && code <= 122);  // a-z
        if (isAlnum) {
            out += ch;
            lastDash = false;
        } else if (!lastDash) {
            out += '-';
            lastDash = true;
        }
    }
    // Trim trailing dash (leading dash never added because lastDash starts true).
    if (out.endsWith('-')) out = out.slice(0, -1);
    return out;
}

/**
 * Validate a restaurant name. Same rules as the admin display-name field:
 * 2..80 chars, no leading/trailing whitespace (trimmed), no control chars.
 */
function validateRestaurantName(value: string): string {
    const v = String(value ?? '').trim();
    if (v.length < MIN_RESTAURANT_NAME_LEN) {
        throw new SignupValidationError('restaurantName', `restaurantName must be at least ${MIN_RESTAURANT_NAME_LEN} chars`);
    }
    if (v.length > MAX_RESTAURANT_NAME_LEN) {
        throw new SignupValidationError('restaurantName', `restaurantName must be <= ${MAX_RESTAURANT_NAME_LEN} chars`);
    }
    return v;
}

function validateCity(value: string): string {
    const v = String(value ?? '').trim();
    if (!v) throw new SignupValidationError('city', 'city is required');
    if (v.length > MAX_CITY_LEN) {
        throw new SignupValidationError('city', `city must be <= ${MAX_CITY_LEN} chars`);
    }
    return v;
}

/**
 * Pick a slug that's not already taken. Starts from `base`, falls back to
 * `base-city`, then appends integer suffixes.
 *
 * Exported for unit testing. The caller passes an `existsFn` that resolves
 * true if a slug is already in use — in prod this hits Mongo; in tests we
 * stub it.
 */
export async function pickAvailableSlug(
    base: string,
    citySlug: string,
    existsFn: (slug: string) => Promise<boolean>,
): Promise<string> {
    if (!base) throw new SignupValidationError('restaurantName', 'restaurantName has no slug-safe characters');
    if (!(await existsFn(base))) return base;
    if (citySlug && citySlug !== base) {
        const withCity = `${base}-${citySlug}`;
        if (!(await existsFn(withCity))) return withCity;
    }
    // Append -2, -3, ... up to MAX_SLUG_ATTEMPTS.
    for (let i = 2; i <= MAX_SLUG_ATTEMPTS; i += 1) {
        const candidate = `${base}-${i}`;
        if (!(await existsFn(candidate))) return candidate;
    }
    throw new SignupConflictError('slug', 'unable to find an available slug — please pick one manually');
}

/**
 * Normalize + validate an explicit slug override. Same rules as auto-derived:
 *   - 2..60 chars of [a-z0-9-], not leading/trailing/consecutive dashes.
 * Throws SignupValidationError on malformed input.
 */
export function validateExplicitSlug(raw: string): string {
    const s = kebabCase(raw);
    if (!s) throw new SignupValidationError('slug', 'slug is empty after normalization');
    if (s.length < 2) throw new SignupValidationError('slug', 'slug must be at least 2 chars');
    if (s.length > 60) throw new SignupValidationError('slug', 'slug must be <= 60 chars');
    // Reserved slugs: operational names that would collide with platform routes.
    const reserved = new Set(['api', 'mcp', 'health', 'login', 'signup', 'reset-password', 'accept-invite', 'r', 'admin']);
    if (reserved.has(s)) throw new SignupValidationError('slug', `slug "${s}" is reserved`);
    return s;
}

/**
 * Generate a 4-digit host PIN. Cryptographically random (crypto.randomInt)
 * so guessing the PIN isn't feasible from a predictable RNG.
 */
export function generateHostPin(): string {
    // 0000-9999 inclusive. Formatted as a 4-char zero-padded string so
    // "0042" is a valid PIN (matches the existing spec of a 4-digit PIN).
    const n = randomInt(0, 10000);
    return n.toString().padStart(4, '0');
}

/**
 * Insert a new Location with the multi-tenant defaults applied:
 *   - websiteTemplate: 'saffron' (preserves the SKB look; spec §8.2)
 *   - onboardingSteps: [] (empty; wizard surfaces all 4 steps)
 *   - createdAt: now
 *
 * Exposed as a distinct function (rather than folded into the signup route)
 * so the signup service can call it AND an integration test can call it
 * directly to set up fixtures without going through the rate-limited HTTP
 * route.
 */
async function insertOwnerLocation(
    slug: string,
    displayName: string,
    pin: string,
): Promise<Location> {
    const db = await getDb();
    const loc: Location = {
        _id: slug,
        name: displayName,
        pin,
        createdAt: new Date(),
        // Pre-fill website defaults so the freshly-created restaurant
        // already renders a working home page (the saffron template has
        // sensible built-ins).
        websiteTemplate: DEFAULT_WEBSITE_TEMPLATE,
        onboardingSteps: [],
    };
    try {
        await locations(db).insertOne(loc);
    } catch (err) {
        if ((err as { code?: number })?.code === 11000) {
            // Lost the race — caller should re-derive the slug. We surface
            // this as a conflict so they can retry.
            throw new SignupConflictError('slug', 'slug was claimed by another signup — please retry');
        }
        throw err;
    }
    return loc;
}

async function deleteLocation(slug: string): Promise<void> {
    const db = await getDb();
    try {
        await locations(db).deleteOne({ _id: slug });
    } catch {
        // Best effort — a failed rollback is operator-visible in logs via the
        // caller's catch, not a reason to mask the original error.
    }
}

async function slugExists(slug: string): Promise<boolean> {
    const db = await getDb();
    const doc = await locations(db).findOne({ _id: slug }, { projection: { _id: 1 } });
    return doc !== null;
}

/**
 * End-to-end owner provisioning.
 *
 * On success returns the new Location + User + Membership + the freshly-
 * generated host PIN (returned ONCE to the caller; never again via any API).
 *
 * On failure throws:
 *  - SignupValidationError (field, message) for input validation
 *  - SignupConflictError (field: 'email' | 'slug', message)
 *  - plain Error for unexpected DB issues
 */
export async function signupOwner(input: OwnerSignupInput): Promise<OwnerSignupResult> {
    // Validate every field BEFORE any DB write so we fail fast on typos.
    // Wrap users.validate* in SignupValidationError so the route returns
    // 400 with a `field` hint instead of bubbling the plain Error up.
    const restaurantName = validateRestaurantName(input.restaurantName);
    const city = validateCity(input.city);
    let ownerName: string;
    try { ownerName = validateName(input.ownerName); }
    catch (err) { throw new SignupValidationError('ownerName', err instanceof Error ? err.message : 'invalid name'); }
    let email: string;
    try { email = validateEmail(input.email); }
    catch (err) { throw new SignupValidationError('email', err instanceof Error ? err.message : 'invalid email'); }
    try { validatePassword(input.password); }
    catch (err) { throw new SignupValidationError('password', err instanceof Error ? err.message : 'invalid password'); }

    // Derive or validate the slug.
    let slug: string;
    if (typeof input.slug === 'string' && input.slug.trim().length > 0) {
        slug = validateExplicitSlug(input.slug);
        if (await slugExists(slug)) {
            throw new SignupConflictError('slug', `slug "${slug}" is already taken`);
        }
    } else {
        const base = kebabCase(restaurantName);
        const citySlug = kebabCase(city);
        slug = await pickAvailableSlug(base, citySlug, slugExists);
    }

    // Create the Location first.
    const pin = generateHostPin();
    const location = await insertOwnerLocation(slug, restaurantName, pin);

    // Create the User + Membership. If this fails, roll back the Location so
    // the slug stays free — otherwise the owner would hit a ghost collision
    // on retry.
    let ownerResult: { user: PublicUser; membership: PublicMembership };
    try {
        ownerResult = await createOwnerUser({
            email,
            password: input.password,
            name: ownerName,
            locationId: slug,
        });
    } catch (err) {
        await deleteLocation(slug);
        if (err instanceof Error && err.message === 'email already registered') {
            throw new SignupConflictError('email', 'email already registered');
        }
        throw err;
    }

    return {
        location: {
            id: location._id,
            name: location.name,
            websiteTemplate: DEFAULT_WEBSITE_TEMPLATE,
            onboardingSteps: [],
            createdAt: location.createdAt,
        },
        hostPin: pin,
        user: ownerResult.user,
        membership: ownerResult.membership,
    };
}
