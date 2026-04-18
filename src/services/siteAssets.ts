// ============================================================================
// OSH — Per-tenant site asset storage (signature dish photos, hero image, ...)
// ============================================================================
//
// Admin forms (wizard + website editor) submit images inline as
// `{ mime, data }` base64 objects instead of multipart uploads. That keeps
// the request shape JSON-only (no multer), which matches the existing
// website-config endpoint and is simpler on the client.
//
// processKnownForImages walks a LocationContent.knownFor array, finds any
// entry whose `image` is an upload-object, writes the decoded bytes to
// `public/assets/<slug>/dishes/<hash>.<ext>`, and replaces the value with
// the served URL path. Existing string URLs pass through unchanged.
//
// Security:
//  - Mime allowlist: image/jpeg | image/png | image/webp (no svg — XSS risk).
//  - Max decoded size: 2 MiB per image.
//  - Filename is SHA-256 of the bytes (content-addressed), preventing
//    collisions and making dedup trivial.
//  - Slug is filter-to-alphanumeric before joining the path; defense against
//    path traversal via controlled locationId (slugs are already validated at
//    signup — this is belt + suspenders).
// ============================================================================

import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { LocationContent, LocationKnownForItem } from '../types/queue.js';

const MAX_IMAGE_BYTES = 2 * 1024 * 1024; // 2 MiB decoded
const ALLOWED_MIME: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
};

interface ImageUpload {
    mime: string;
    data: string; // base64, possibly with data-URL prefix
}

function isImageUpload(v: unknown): v is ImageUpload {
    return !!v && typeof v === 'object' && !Array.isArray(v)
        && typeof (v as { mime?: unknown }).mime === 'string'
        && typeof (v as { data?: unknown }).data === 'string';
}

function safeSlug(locationId: string): string {
    const s = (locationId || '').replace(/[^a-zA-Z0-9-]/g, '');
    return s.length > 0 ? s : 'unknown';
}

/**
 * Decode a single base64 image and write it to disk. Returns the served
 * URL path. Throws on mime / size violations — caller should translate
 * to a 400 response.
 */
async function persistImage(
    publicDir: string,
    locationId: string,
    subfolder: string,
    upload: ImageUpload,
): Promise<string> {
    const mime = String(upload.mime).toLowerCase().trim();
    const ext = ALLOWED_MIME[mime];
    if (!ext) {
        throw new Error(`image mime must be one of: ${Object.keys(ALLOWED_MIME).join(', ')}`);
    }
    // Strip data-URL prefix if the client sent the full "data:image/jpeg;base64,..." form.
    const raw = String(upload.data).replace(/^data:[^;]+;base64,/, '');
    const buf = Buffer.from(raw, 'base64');
    if (buf.length === 0) throw new Error('image data is empty');
    if (buf.length > MAX_IMAGE_BYTES) {
        throw new Error(`image too large (${buf.length} bytes; max ${MAX_IMAGE_BYTES})`);
    }

    const slug = safeSlug(locationId);
    const hash = createHash('sha256').update(buf).digest('hex').slice(0, 24);
    const filename = `${hash}.${ext}`;
    const dir = path.join(publicDir, 'assets', slug, subfolder);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, filename), buf);

    // Absolute URL path, works both under / and under host-rewritten domains
    // (the host rewrite middleware leaves /assets/... alone — see mcp-server.ts).
    return `/assets/${slug}/${subfolder}/${filename}`;
}

/**
 * Walk the content.knownFor array and persist any base64 uploads, replacing
 * the `image` field with the resulting URL string. Mutates `content`.
 */
export async function processKnownForImages(
    publicDir: string,
    locationId: string,
    content: LocationContent,
): Promise<void> {
    if (!content.knownFor || !Array.isArray(content.knownFor)) return;
    const next: LocationKnownForItem[] = [];
    for (const item of content.knownFor) {
        const it = (item ?? {}) as LocationKnownForItem & { image?: unknown };
        if (isImageUpload(it.image)) {
            const url = await persistImage(publicDir, locationId, 'dishes', it.image);
            next.push({ title: String(it.title ?? ''), desc: String(it.desc ?? ''), image: url });
        } else {
            next.push({
                title: String(it.title ?? ''),
                desc: String(it.desc ?? ''),
                image: typeof it.image === 'string' ? it.image : '',
            });
        }
    }
    content.knownFor = next;
}

export const __TEST__ = { MAX_IMAGE_BYTES, ALLOWED_MIME, safeSlug };
