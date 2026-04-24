import { runTests } from '../test-utils.js';
import { buildVisitQrUrl } from '../../src/services/visitQrUrl.js';

const cases = [
    {
        name: 'buildVisitQrUrl prefers location public URL over request host',
        tags: ['unit', 'qr', 'visit'],
        testFn: async () => (
            buildVisitQrUrl({
                locationId: 'skb',
                requestProto: 'https',
                requestHost: 'preview.osh.example.com',
                locationPublicUrl: 'https://skbbellevue.com',
            }) === 'https://skbbellevue.com/r/skb/visit'
        ),
    },
    {
        name: 'buildVisitQrUrl keeps the per-location visit path when publicHost exists',
        tags: ['unit', 'qr', 'visit'],
        testFn: async () => (
            buildVisitQrUrl({
                locationId: 'skb',
                locationPublicHost: 'skbbellevue.com',
            }) === 'https://skbbellevue.com/r/skb/visit'
        ),
    },
    {
        name: 'buildVisitQrUrl falls back to request host when no configured public URL exists',
        tags: ['unit', 'qr', 'visit'],
        testFn: async () => (
            buildVisitQrUrl({
                locationId: 'skb',
                requestProto: 'https',
                requestHost: 'preview.osh.example.com',
            }) === 'https://preview.osh.example.com/r/skb/visit'
        ),
    },
];

void runTests(cases, 'Visit QR URL');
