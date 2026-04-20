// ============================================================================
// SKB - Guest cart + placed-order service
// ============================================================================

import { ObjectId } from 'mongodb';

import { getDb, partyOrders, queueEntries, type PartyOrder } from '../core/db/mongo.js';
import { getLocation } from './locations.js';
import type {
    GuestCartDTO,
    GuestCartLineDTO,
    GuestCartLineInputDTO,
    HostPartyOrderDTO,
    Location,
    MenuItem,
    MenuSection,
    PartyState,
    QueueEntry,
} from '../types/queue.js';

const CART_EDITABLE_STATES: PartyState[] = ['waiting', 'called', 'seated'];
const CART_PLACEABLE_STATES: PartyState[] = ['seated', 'ordered'];
const MAX_CART_LINES = 25;
const MAX_LINE_NOTES = 280;
const MAX_LINE_QUANTITY = 20;

interface MenuLookup {
    section: MenuSection;
    item: MenuItem;
}

function emptyCart(code: string): GuestCartDTO {
    return {
        code,
        state: 'none',
        lines: [],
        totalQuantity: 0,
        updatedAt: null,
    };
}

function toCartDto(code: string, order?: PartyOrder | null): GuestCartDTO {
    if (!order) return emptyCart(code);
    return {
        code,
        state: order.state,
        lines: order.lines,
        totalQuantity: order.totalQuantity,
        updatedAt: order.updatedAt.toISOString(),
        placedAt: order.placedAt?.toISOString(),
    };
}

function validateLineInput(line: GuestCartLineInputDTO, index: number): void {
    if (!line || typeof line.menuItemId !== 'string' || line.menuItemId.trim().length === 0) {
        throw new Error(`cart.lines[${index}].menuItemId is required`);
    }
    if (!Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > MAX_LINE_QUANTITY) {
        throw new Error(`cart.lines[${index}].quantity must be an integer 1..${MAX_LINE_QUANTITY}`);
    }
    if (line.notes !== undefined) {
        if (typeof line.notes !== 'string') throw new Error(`cart.lines[${index}].notes must be a string`);
        if (line.notes.trim().length > MAX_LINE_NOTES) {
            throw new Error(`cart.lines[${index}].notes must be <= ${MAX_LINE_NOTES} chars`);
        }
    }
    if (line.selectedOptions !== undefined) {
        if (!Array.isArray(line.selectedOptions)) {
            throw new Error(`cart.lines[${index}].selectedOptions must be an array`);
        }
        for (const [optionIndex, option] of line.selectedOptions.entries()) {
            if (typeof option !== 'string' || option.trim().length === 0) {
                throw new Error(`cart.lines[${index}].selectedOptions[${optionIndex}] must be a string`);
            }
        }
    }
}

function findMenuItem(location: Location, menuItemId: string): MenuLookup | null {
    for (const section of location.menu?.sections ?? []) {
        for (const item of section.items ?? []) {
            if (item.id === menuItemId) return { section, item };
        }
    }
    return null;
}

function buildCartLine(
    location: Location,
    line: GuestCartLineInputDTO,
): GuestCartLineDTO {
    const lookup = findMenuItem(location, line.menuItemId);
    if (!lookup) throw new Error(`cart.menuItemId not found: ${line.menuItemId}`);
    const optionalIngredients = lookup.item.optionalIngredients ?? [];
    const selectedOptions = Array.from(new Set((line.selectedOptions ?? []).map((item) => item.trim()).filter(Boolean)));
    for (const selected of selectedOptions) {
        if (!optionalIngredients.includes(selected)) {
            throw new Error(`cart.selectedOption invalid for ${lookup.item.name}: ${selected}`);
        }
    }
    if (lookup.item.availability === 'sold_out') {
        throw new Error(`cart.menuItem unavailable: ${lookup.item.name}`);
    }
    const notes = typeof line.notes === 'string' ? line.notes.trim() : '';
    return {
        menuItemId: lookup.item.id,
        sectionId: lookup.section.id,
        sectionTitle: lookup.section.title,
        name: lookup.item.name,
        description: lookup.item.description,
        price: lookup.item.price,
        image: lookup.item.image,
        quantity: line.quantity,
        notes: notes || undefined,
        requiredIngredients: [...(lookup.item.requiredIngredients ?? [])],
        optionalIngredients: [...optionalIngredients],
        selectedOptions,
        availability: lookup.item.availability ?? 'available',
    };
}

async function getEntryByCode(code: string): Promise<QueueEntry | null> {
    const db = await getDb();
    return queueEntries(db).findOne({ code });
}

async function getOrderByCode(code: string): Promise<PartyOrder | null> {
    const db = await getDb();
    return partyOrders(db).findOne({ code });
}

export async function getGuestCartByCode(locationId: string, code: string): Promise<GuestCartDTO> {
    const entry = await getEntryByCode(code);
    if (!entry || entry.locationId !== locationId) throw new Error('order.not_found');
    return toCartDto(code, await getOrderByCode(code));
}

export async function upsertGuestCart(
    locationId: string,
    code: string,
    inputLines: GuestCartLineInputDTO[],
    now: Date = new Date(),
): Promise<GuestCartDTO> {
    if (!Array.isArray(inputLines)) throw new Error('cart.lines must be an array');
    if (inputLines.length > MAX_CART_LINES) {
        throw new Error(`cart.lines must be <= ${MAX_CART_LINES}`);
    }
    inputLines.forEach((line, index) => validateLineInput(line, index));

    const entry = await getEntryByCode(code);
    if (!entry) throw new Error('order.not_found');
    if (entry.locationId !== locationId) throw new Error('order.not_found');
    if (!CART_EDITABLE_STATES.includes(entry.state)) {
        throw new Error(`order.state cannot edit while ${entry.state}`);
    }

    const location = await getLocation(entry.locationId);
    if (!location) throw new Error('order.location_not_found');
    if (!location.menu || !Array.isArray(location.menu.sections) || location.menu.sections.length === 0) {
        throw new Error('order.menu_unavailable');
    }

    const nextLines = inputLines.map((line) => buildCartLine(location, line));
    const totalQuantity = nextLines.reduce((sum, line) => sum + line.quantity, 0);
    const db = await getDb();

    if (nextLines.length === 0) {
        await partyOrders(db).deleteOne({ code, state: 'draft' });
        const existingPlaced = await partyOrders(db).findOne({ code, state: 'placed' });
        return toCartDto(code, existingPlaced);
    }

    const existing = await partyOrders(db).findOne({ code });
    if (existing?.state === 'placed') {
        throw new Error('order.already_placed');
    }

    await partyOrders(db).updateOne(
        { code },
        {
            $set: {
                locationId: entry.locationId,
                code,
                serviceDay: entry.serviceDay,
                entryId: String((entry as { _id?: unknown })._id ?? ''),
                state: 'draft',
                lines: nextLines,
                totalQuantity,
                updatedAt: now,
            },
        },
        { upsert: true },
    );

    return toCartDto(code, await partyOrders(db).findOne({ code }));
}

export async function placeGuestOrder(
    locationId: string,
    code: string,
    now: Date = new Date(),
): Promise<GuestCartDTO> {
    const entry = await getEntryByCode(code);
    if (!entry) throw new Error('order.not_found');
    if (entry.locationId !== locationId) throw new Error('order.not_found');
    if (!CART_PLACEABLE_STATES.includes(entry.state)) {
        throw new Error(`order.state cannot place while ${entry.state}`);
    }

    const db = await getDb();
    const existing = await partyOrders(db).findOne({ code });
    if (!existing || existing.lines.length === 0) {
        throw new Error('order.empty_cart');
    }
    if (existing.state === 'placed') {
        return toCartDto(code, existing);
    }

    await partyOrders(db).updateOne(
        { code, state: 'draft' },
        {
            $set: {
                state: 'placed',
                updatedAt: now,
                placedAt: now,
            },
        },
    );

    if (entry.state === 'seated') {
        await queueEntries(db).updateOne(
            { code, state: 'seated' },
            { $set: { state: 'ordered', orderedAt: now } },
        );
    }

    return toCartDto(code, await partyOrders(db).findOne({ code }));
}

export async function getHostPartyOrder(partyId: string): Promise<HostPartyOrderDTO | null> {
    const db = await getDb();
    let _id: ObjectId;
    try {
        _id = new ObjectId(partyId);
    } catch {
        throw new Error('invalid id');
    }

    const entry = await queueEntries(db).findOne({ _id });
    if (!entry) return null;

    const order = await partyOrders(db).findOne({ code: entry.code });
    if (!order) {
        return {
            code: entry.code,
            state: 'none',
            lines: [],
            totalQuantity: 0,
            updatedAt: null,
        };
    }

    return {
        code: entry.code,
        state: order.state,
        lines: order.lines,
        totalQuantity: order.totalQuantity,
        updatedAt: order.updatedAt.toISOString(),
        placedAt: order.placedAt?.toISOString(),
    };
}
