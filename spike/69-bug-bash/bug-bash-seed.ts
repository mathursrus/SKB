// Seed Mongo for bug bash (issue #69). Run via:
//   MONGODB_DB_NAME=skb_bug_bash_69 npx tsx spike/69-bug-bash/bug-bash-seed.ts

import { MongoClient } from 'mongodb';

async function main() {
const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017';
// Use the same DB the server resolves to via determineDatabaseName().
// On this branch (spec/69-shared-sms-number-multitenant) the branch regex
// matches "69-" and resolves to skb_issue_69 — overriding MONGODB_DB_NAME.
const dbName = process.env.MONGODB_DB_NAME || 'skb_issue_69';
const client = new MongoClient(uri, { serverSelectionTimeoutMS: 3000 });

// Match the server's PT service-day format (America/Los_Angeles, en-CA).
const serviceDay = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());
console.log('Seeding serviceDay=' + serviceDay);

await client.connect();
const db = client.db(dbName);

// Fresh state.
await db.collection('locations').deleteMany({});
await db.collection('queue_entries').deleteMany({});
await db.collection('sms_opt_outs').deleteMany({});

// Two tenants.
await db.collection('locations').insertMany([
    { _id: 'skb', name: 'Shri Krishna Bhavan', smsSenderName: 'Shri Krishna Bhavan', pin: '1111', createdAt: new Date() },
    { _id: 'pizza', name: 'Bellevue Pizza House', smsSenderName: 'Bellevue Pizza House', pin: '2222', createdAt: new Date() },
]);

const today = serviceDay;

await db.collection('queue_entries').insertMany([
    // Alice is at SKB only — simple happy path match.
    { locationId: 'skb',   code: 'SKB-A1', name: 'Alice',   partySize: 2, phone: '2065551111', state: 'waiting', serviceDay: today, joinedAt: new Date() },
    // Bob is at SKB AND Pizza — collision case.
    { locationId: 'skb',   code: 'SKB-B1', name: 'Bob',     partySize: 3, phone: '2065552222', state: 'waiting', serviceDay: today, joinedAt: new Date() },
    { locationId: 'pizza', code: 'PZ-B2',  name: 'Bob',     partySize: 3, phone: '2065552222', state: 'waiting', serviceDay: today, joinedAt: new Date(Date.now() + 1000) },
    // Carol is seated (active state is not just waiting).
    { locationId: 'pizza', code: 'PZ-C1',  name: 'Carol',   partySize: 4, phone: '2065553333', state: 'seated',  serviceDay: today, joinedAt: new Date() },
    // Dave departed — should NOT match (state not in active set).
    { locationId: 'skb',   code: 'SKB-D1', name: 'Dave',    partySize: 1, phone: '2065554444', state: 'departed', serviceDay: today, joinedAt: new Date() },
]);

console.log(JSON.stringify({
    locations: await db.collection('locations').countDocuments(),
    queueEntries: await db.collection('queue_entries').countDocuments(),
    smsOptOuts: await db.collection('sms_opt_outs').countDocuments(),
}));

await client.close();
}
main().catch(e => { console.error(e); process.exit(1); });
