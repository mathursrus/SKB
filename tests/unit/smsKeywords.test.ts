// Unit tests for STOP/START/HELP keyword recognition (#69).
import { runTests } from '../test-utils.js';
import { isStopKeyword, isStartKeyword, isHelpKeyword } from '../../src/utils/smsKeywords.js';

const cases = [
    // --- STOP family ---
    { name: 'STOP matches "stop"',        tags: ['unit', 'sms'], testFn: async () => isStopKeyword('stop') },
    { name: 'STOP matches "STOP"',        tags: ['unit', 'sms'], testFn: async () => isStopKeyword('STOP') },
    { name: 'STOP matches "  stop  "',    tags: ['unit', 'sms'], testFn: async () => isStopKeyword('  stop  ') },
    { name: 'STOP matches "stop sending texts"', tags: ['unit', 'sms'], testFn: async () => isStopKeyword('stop sending texts') },
    { name: 'STOP matches "unsubscribe"', tags: ['unit', 'sms'], testFn: async () => isStopKeyword('unsubscribe') },
    { name: 'STOP matches "CANCEL"',      tags: ['unit', 'sms'], testFn: async () => isStopKeyword('CANCEL') },
    { name: 'STOP matches "end"',         tags: ['unit', 'sms'], testFn: async () => isStopKeyword('end') },
    { name: 'STOP matches "quit"',        tags: ['unit', 'sms'], testFn: async () => isStopKeyword('quit') },
    { name: 'STOP matches "optout"',      tags: ['unit', 'sms'], testFn: async () => isStopKeyword('optout') },
    { name: 'STOP does not match "stop at the store"', tags: ['unit', 'sms'], testFn: async () => !isStopKeyword('I will stop at the store') },
    { name: 'STOP does not match "please stop"',        tags: ['unit', 'sms'], testFn: async () => !isStopKeyword('please stop') },
    { name: 'STOP does not match ""',                    tags: ['unit', 'sms'], testFn: async () => !isStopKeyword('') },
    { name: 'STOP does not match "running 5 late"',      tags: ['unit', 'sms'], testFn: async () => !isStopKeyword('running 5 late') },

    // --- START family ---
    { name: 'START matches "start"',  tags: ['unit', 'sms'], testFn: async () => isStartKeyword('start') },
    { name: 'START matches "START"',  tags: ['unit', 'sms'], testFn: async () => isStartKeyword('START') },
    { name: 'START matches "unstop"', tags: ['unit', 'sms'], testFn: async () => isStartKeyword('unstop') },
    { name: 'START matches "YES"',    tags: ['unit', 'sms'], testFn: async () => isStartKeyword('YES') },
    { name: 'START does not match "I started yesterday"', tags: ['unit', 'sms'], testFn: async () => !isStartKeyword('I started yesterday') },

    // --- HELP family ---
    { name: 'HELP matches "help"',    tags: ['unit', 'sms'], testFn: async () => isHelpKeyword('help') },
    { name: 'HELP matches "HELP"',    tags: ['unit', 'sms'], testFn: async () => isHelpKeyword('HELP') },
    { name: 'HELP matches "info"',    tags: ['unit', 'sms'], testFn: async () => isHelpKeyword('info') },
    { name: 'HELP does not match "I need help with my car"', tags: ['unit', 'sms'], testFn: async () => !isHelpKeyword('I need help with my car') },

    // --- Disjoint (a body shouldn't be multiple at once) ---
    { name: 'plain reply is none of STOP/START/HELP', tags: ['unit', 'sms'], testFn: async () => {
        const body = 'running 5 late';
        return !isStopKeyword(body) && !isStartKeyword(body) && !isHelpKeyword(body);
    } },
];

void runTests(cases, 'SMS keywords (STOP/START/HELP)');
