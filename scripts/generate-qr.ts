// One-time script to generate the QR code SVG for issue #2.
// Run: npx tsx scripts/generate-qr.ts
import QRCode from 'qrcode';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TARGET_URL = 'https://skb-waitlist.azurewebsites.net/queue.html';
const OUT_PATH = path.resolve(__dirname, '..', 'public', 'qr.svg');

async function main(): Promise<void> {
    const svg = await QRCode.toString(TARGET_URL, {
        type: 'svg',
        errorCorrectionLevel: 'H',
        margin: 2,
        color: {
            dark: '#000000',
            light: '#ffffff',
        },
    });
    writeFileSync(OUT_PATH, svg, 'utf-8');
    console.log(`QR SVG written to ${OUT_PATH} (${svg.length} bytes)`);
}

main().catch((e: unknown) => {
    console.error(e);
    process.exit(1);
});
