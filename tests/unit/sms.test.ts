// Unit tests for SMS service — maskPhone utility
import { runTests } from '../test-utils.js';
import { maskPhone } from '../../src/services/sms.js';

const cases = [
    {
        name: 'maskPhone masks all but last 4 digits',
        tags: ['unit', 'sms'],
        testFn: async () => maskPhone('2065551234') === '******1234',
    },
    {
        name: 'maskPhone handles short input',
        tags: ['unit', 'sms'],
        testFn: async () => maskPhone('1234') === '******1234',
    },
    {
        name: 'maskPhone handles empty string',
        tags: ['unit', 'sms'],
        testFn: async () => maskPhone('') === '******',
    },
];

void runTests(cases, 'SMS Service — maskPhone');
