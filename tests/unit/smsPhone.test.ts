// Unit tests for phone normalization shared by SMS routing (#69).
import { runTests } from '../test-utils.js';
import { normalizePhone } from '../../src/utils/smsPhone.js';

const cases = [
    { name: '10-digit plain',       tags: ['unit', 'sms'], testFn: async () => normalizePhone('2065551234') === '2065551234' },
    { name: 'E.164 +1NNNNNNNNNN',   tags: ['unit', 'sms'], testFn: async () => normalizePhone('+12065551234') === '2065551234' },
    { name: 'leading 1 no plus',    tags: ['unit', 'sms'], testFn: async () => normalizePhone('12065551234') === '2065551234' },
    { name: 'formatted "(206) 555-1234"', tags: ['unit', 'sms'], testFn: async () => normalizePhone('(206) 555-1234') === '2065551234' },
    { name: 'trailing 10 digits on long string', tags: ['unit', 'sms'], testFn: async () => normalizePhone('foo-bar+12065551234') === '2065551234' },
    { name: 'empty input → empty string',        tags: ['unit', 'sms'], testFn: async () => normalizePhone('') === '' },
    { name: 'non-digit junk → empty string',     tags: ['unit', 'sms'], testFn: async () => normalizePhone('no digits here') === '' },
];

void runTests(cases, 'SMS phone normalization');
