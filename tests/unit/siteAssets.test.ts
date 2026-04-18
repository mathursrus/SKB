// Unit tests for src/services/siteAssets.ts — inline base64 image upload,
// mime allowlist, size caps, path-traversal defense, content-addressed
// filenames, pass-through for existing URLs.
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { runTests, type BaseTestCase } from '../test-utils.js';
import {
    processKnownForImages,
    __TEST__,
} from '../../src/services/siteAssets.js';
import type { LocationContent } from '../../src/types/queue.js';

// 1x1 pixel test images, base64 raw (no data: prefix).
const ONE_PX_JPEG_B64 = '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAYEBAQFBAYFBQYJBgUGCQsIBgYICwwKCgsKCgwQDAwMDAwMEAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAz/2wBDAQcHBw0MDRgQEBgUDg4OFBQODg4OFBEMDAwMDBERDAwMDAwMEQwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAz/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD8qKKKK/sg/wAnz//Z';

const ONE_PX_PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';

let tmpPublicDir: string;

function setup() {
    tmpPublicDir = mkdtempSync(path.join(os.tmpdir(), 'osh-assets-'));
}
function teardown() {
    if (tmpPublicDir) rmSync(tmpPublicDir, { recursive: true, force: true });
}

const cases: BaseTestCase[] = [
    // ─── pass-through ─────────────────────────────────────────────────
    {
        name: 'empty content: no knownFor array → no-op',
        tags: ['unit', 'site-assets'],
        testFn: async () => {
            setup();
            try {
                const content: LocationContent = {};
                await processKnownForImages(tmpPublicDir, 'abcd', content);
                return content.knownFor === undefined;
            } finally { teardown(); }
        },
    },
    {
        name: 'existing string URLs pass through unchanged',
        tags: ['unit', 'site-assets'],
        testFn: async () => {
            setup();
            try {
                const content: LocationContent = {
                    knownFor: [
                        { title: 'A', desc: 'a', image: '/assets/abcd/dishes/existing.jpg' },
                        { title: 'B', desc: 'b', image: '' },
                        { title: 'C', desc: 'c', image: 'https://cdn.example.com/pic.png' },
                    ],
                };
                await processKnownForImages(tmpPublicDir, 'abcd', content);
                const imgs = (content.knownFor ?? []).map(k => k.image);
                return imgs[0] === '/assets/abcd/dishes/existing.jpg'
                    && imgs[1] === ''
                    && imgs[2] === 'https://cdn.example.com/pic.png';
            } finally { teardown(); }
        },
    },

    // ─── upload happy path ────────────────────────────────────────────
    {
        name: 'JPEG upload: writes to disk, returns /assets/<slug>/dishes/<hash>.jpg URL',
        tags: ['unit', 'site-assets', 'upload'],
        testFn: async () => {
            setup();
            try {
                const content: LocationContent = {
                    knownFor: [
                        { title: 'Tonkotsu', desc: '36-hour', image: { mime: 'image/jpeg', data: ONE_PX_JPEG_B64 } as any },
                        { title: 'B', desc: 'b', image: '' },
                        { title: 'C', desc: 'c', image: '' },
                    ],
                };
                await processKnownForImages(tmpPublicDir, 'abcd', content);
                const url = (content.knownFor ?? [])[0].image;
                if (!/^\/assets\/abcd\/dishes\/[a-f0-9]{24}\.jpg$/.test(url)) return false;
                // Verify the file actually exists on disk under tmpPublicDir/assets/abcd/dishes
                const diskPath = path.join(tmpPublicDir, url.replace(/^\//, ''));
                const buf = readFileSync(diskPath);
                return buf.length > 0;
            } finally { teardown(); }
        },
    },
    {
        name: 'PNG upload: writes .png extension',
        tags: ['unit', 'site-assets', 'upload'],
        testFn: async () => {
            setup();
            try {
                const content: LocationContent = {
                    knownFor: [{ title: 'A', desc: '', image: { mime: 'image/png', data: ONE_PX_PNG_B64 } as any }],
                };
                await processKnownForImages(tmpPublicDir, 'abcd', content);
                const url = (content.knownFor ?? [])[0].image;
                return /^\/assets\/abcd\/dishes\/[a-f0-9]{24}\.png$/.test(url);
            } finally { teardown(); }
        },
    },
    {
        name: 'WebP mime is accepted',
        tags: ['unit', 'site-assets', 'upload'],
        testFn: async () => {
            setup();
            try {
                // Smallest-possible WebP: 26 bytes. We only verify the mime
                // passes our allowlist; the file bytes don't have to be valid.
                const content: LocationContent = {
                    knownFor: [{ title: 'A', desc: '', image: { mime: 'image/webp', data: 'AAAA' } as any }],
                };
                await processKnownForImages(tmpPublicDir, 'abcd', content);
                const url = (content.knownFor ?? [])[0].image;
                return url.endsWith('.webp');
            } finally { teardown(); }
        },
    },
    {
        name: 'data: URL prefix is stripped before decode',
        tags: ['unit', 'site-assets', 'upload'],
        testFn: async () => {
            setup();
            try {
                const prefixed = `data:image/png;base64,${ONE_PX_PNG_B64}`;
                const content: LocationContent = {
                    knownFor: [{ title: 'A', desc: '', image: { mime: 'image/png', data: prefixed } as any }],
                };
                await processKnownForImages(tmpPublicDir, 'abcd', content);
                const url = (content.knownFor ?? [])[0].image;
                // Same hash should result as without the prefix — content-addressed.
                const diskPath = path.join(tmpPublicDir, url.replace(/^\//, ''));
                const buf = readFileSync(diskPath);
                // PNG signature starts with 0x89 0x50 0x4E 0x47
                return buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47;
            } finally { teardown(); }
        },
    },
    {
        name: 'content-addressed filename: same bytes → same URL (dedupe)',
        tags: ['unit', 'site-assets', 'upload'],
        testFn: async () => {
            setup();
            try {
                const c1: LocationContent = {
                    knownFor: [{ title: 'A', desc: '', image: { mime: 'image/png', data: ONE_PX_PNG_B64 } as any }],
                };
                const c2: LocationContent = {
                    knownFor: [{ title: 'B', desc: '', image: { mime: 'image/png', data: ONE_PX_PNG_B64 } as any }],
                };
                await processKnownForImages(tmpPublicDir, 'abcd', c1);
                await processKnownForImages(tmpPublicDir, 'abcd', c2);
                return (c1.knownFor ?? [])[0].image === (c2.knownFor ?? [])[0].image;
            } finally { teardown(); }
        },
    },

    // ─── validation ───────────────────────────────────────────────────
    {
        name: 'unsupported mime (image/svg+xml) throws',
        tags: ['unit', 'site-assets', 'validation'],
        testFn: async () => {
            setup();
            try {
                const content: LocationContent = {
                    knownFor: [{ title: 'A', desc: '', image: { mime: 'image/svg+xml', data: 'PHN2Zy8+' } as any }],
                };
                try {
                    await processKnownForImages(tmpPublicDir, 'abcd', content);
                    return false;
                } catch (err) {
                    return err instanceof Error && err.message.includes('mime');
                }
            } finally { teardown(); }
        },
    },
    {
        name: 'empty data throws',
        tags: ['unit', 'site-assets', 'validation'],
        testFn: async () => {
            setup();
            try {
                const content: LocationContent = {
                    knownFor: [{ title: 'A', desc: '', image: { mime: 'image/png', data: '' } as any }],
                };
                try {
                    await processKnownForImages(tmpPublicDir, 'abcd', content);
                    return false;
                } catch (err) {
                    return err instanceof Error && err.message.includes('empty');
                }
            } finally { teardown(); }
        },
    },
    {
        name: 'oversize (>2MiB) throws',
        tags: ['unit', 'site-assets', 'validation'],
        testFn: async () => {
            setup();
            try {
                // 3 MiB of random data, base64 encoded
                const big = Buffer.alloc(3 * 1024 * 1024, 0x41).toString('base64');
                const content: LocationContent = {
                    knownFor: [{ title: 'A', desc: '', image: { mime: 'image/jpeg', data: big } as any }],
                };
                try {
                    await processKnownForImages(tmpPublicDir, 'abcd', content);
                    return false;
                } catch (err) {
                    return err instanceof Error && err.message.includes('too large');
                }
            } finally { teardown(); }
        },
    },
    {
        name: 'slug sanitizer strips non-alphanumeric chars (path-traversal defense)',
        tags: ['unit', 'site-assets', 'security'],
        testFn: async () => {
            return __TEST__.safeSlug('../../etc/passwd') === 'etcpasswd'
                && __TEST__.safeSlug('abcd') === 'abcd'
                && __TEST__.safeSlug('the-corner-seattle') === 'the-corner-seattle'
                && __TEST__.safeSlug('') === 'unknown';
        },
    },
    {
        name: 'upload for tenant A does not end up in tenant B directory',
        tags: ['unit', 'site-assets', 'security', 'multi-tenant'],
        testFn: async () => {
            setup();
            try {
                const cA: LocationContent = {
                    knownFor: [{ title: 'A', desc: '', image: { mime: 'image/png', data: ONE_PX_PNG_B64 } as any }],
                };
                const cB: LocationContent = {
                    knownFor: [{ title: 'B', desc: '', image: { mime: 'image/png', data: ONE_PX_PNG_B64 } as any }],
                };
                await processKnownForImages(tmpPublicDir, 'tenant-a', cA);
                await processKnownForImages(tmpPublicDir, 'tenant-b', cB);
                const urlA = (cA.knownFor ?? [])[0].image;
                const urlB = (cB.knownFor ?? [])[0].image;
                return urlA.startsWith('/assets/tenant-a/dishes/')
                    && urlB.startsWith('/assets/tenant-b/dishes/')
                    // Verify both files exist in their own tenant dirs
                    && readdirSync(path.join(tmpPublicDir, 'assets', 'tenant-a', 'dishes')).length === 1
                    && readdirSync(path.join(tmpPublicDir, 'assets', 'tenant-b', 'dishes')).length === 1;
            } finally { teardown(); }
        },
    },
];

void runTests(cases, 'siteAssets service');
