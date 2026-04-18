// One-off helper for the ABCD demo script. Clears any prior state so
// the demo always starts from zero — useful when rehearsing the flow.
//
// Usage: node scripts/demo-reset-abcd.mjs
//
// Targets the DB the dev server uses (skb_issue_51 on the feature branch
// or skb_dev on master). Safe to run multiple times.
import { MongoClient } from 'mongodb';

const uri = process.env.MONGODB_URI ?? 'mongodb://localhost:27017';
const dbName = process.env.MONGODB_DB_NAME ?? 'skb_issue_51';

const client = new MongoClient(uri);
await client.connect();
const db = client.db(dbName);

const locId = 'abcd';
const demoEmail = 'alice@abcd-demo.test';
const staffEmail = 'marco@abcd-demo.test';

const loc = await db.collection('locations').deleteMany({ _id: locId });
const users = await db.collection('users').deleteMany({ email: { $in: [demoEmail, staffEmail] } });
const mem = await db.collection('memberships').deleteMany({ locationId: locId });
const inv = await db.collection('invites').deleteMany({ locationId: locId });
const q = await db.collection('queue_entries').deleteMany({ locationId: locId });
const set = await db.collection('settings').deleteMany({ _id: locId });

console.log(JSON.stringify({
    db: dbName,
    cleared: {
        locations: loc.deletedCount,
        users: users.deletedCount,
        memberships: mem.deletedCount,
        invites: inv.deletedCount,
        queue_entries: q.deletedCount,
        settings: set.deletedCount,
    },
}));
await client.close();
