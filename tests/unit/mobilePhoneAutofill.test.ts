import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runTests, type BaseTestCase } from '../test-utils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const QUEUE_HTML = fs.readFileSync(
    path.resolve(__dirname, '..', '..', 'public', 'queue.html'),
    'utf-8',
);

function phoneInputTag(): string {
    const match = QUEUE_HTML.match(/<input[^>]*id="phone"[^>]*>/i);
    return match ? match[0] : '';
}

const cases: BaseTestCase[] = [
    {
        name: 'queue join phone input includes mobile autofill metadata',
        tags: ['unit', 'queue', 'mobile', 'autofill'],
        testFn: async () => {
            const input = phoneInputTag();
            return /type="tel"/i.test(input)
                && /name="phone"/i.test(input)
                && /autocomplete="tel"/i.test(input)
                && /inputmode="numeric"/i.test(input);
        },
    },
];

void runTests(cases, 'mobile phone autofill');
