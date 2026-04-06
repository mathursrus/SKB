// Unit tests for issue #2: QR code static asset at public/qr.svg
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runTests } from './test-utils.js';

interface T { name: string; description?: string; tags?: string[]; testFn?: () => Promise<boolean>; }

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const QR_SVG_PATH = path.resolve(__dirname, '..', 'public', 'qr.svg');

const cases: T[] = [
    {
        name: 'public/qr.svg file exists',
        tags: ['unit', 'qr'],
        testFn: async () => {
            return existsSync(QR_SVG_PATH);
        },
    },
    {
        name: 'qr.svg is valid SVG (starts with <svg or <?xml)',
        tags: ['unit', 'qr'],
        testFn: async () => {
            const content = readFileSync(QR_SVG_PATH, 'utf-8').trim();
            return content.startsWith('<svg') || content.startsWith('<?xml');
        },
    },
    {
        name: 'qr.svg contains SVG namespace',
        tags: ['unit', 'qr'],
        testFn: async () => {
            const content = readFileSync(QR_SVG_PATH, 'utf-8');
            return content.includes('xmlns="http://www.w3.org/2000/svg"');
        },
    },
    {
        name: 'qr.svg uses black (#000000 or #000) modules for scan reliability',
        tags: ['unit', 'qr'],
        testFn: async () => {
            const content = readFileSync(QR_SVG_PATH, 'utf-8');
            // QR code SVGs typically use black fill for modules
            return content.includes('#000') || content.includes('rgb(0,0,0)') || content.includes('black');
        },
    },
    {
        name: 'qr.svg has reasonable size for 2x2 inch print (> 1KB)',
        tags: ['unit', 'qr'],
        testFn: async () => {
            const content = readFileSync(QR_SVG_PATH, 'utf-8');
            // A real QR code SVG with error correction H should be substantial
            return content.length > 1000;
        },
    },
    {
        name: 'qr.svg does not contain tracking parameters or non-URL content in data',
        tags: ['unit', 'qr'],
        testFn: async () => {
            const content = readFileSync(QR_SVG_PATH, 'utf-8');
            // The SVG should not contain UTM params or other tracking
            return !content.includes('utm_') && !content.includes('fbclid') && !content.includes('gclid');
        },
    },
];

void runTests(cases, 'QR code static asset (issue #2)');
