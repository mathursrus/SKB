import { MongoClient, ObjectId } from 'mongodb';
import argon2 from 'argon2';
import { mintSessionCookie } from '../../src/middleware/hostAuth.js';

async function main() {
    const secret = process.env.SKB_COOKIE_SECRET || 'polish-secret';
    const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017';
    const dbName = process.env.MONGODB_DB_NAME || 'skb_issue_69';
    const c = new MongoClient(uri, { serverSelectionTimeoutMS: 3000 });
    await c.connect();
    const db = c.db(dbName);

    const email = 'owner-test@osh.local';
    const userId = new ObjectId();
    const hash = await argon2.hash('polish-test-pw');
    await db.collection('users').updateOne(
        { email },
        { $set: { email, passwordHash: hash, createdAt: new Date() }, $setOnInsert: { _id: userId } },
        { upsert: true },
    );
    const u = await db.collection('users').findOne({ email });
    if (!u) throw new Error('user upsert failed');

    // Delete any string-keyed membership rows from a previous iteration and
    // re-seed with ObjectId userId (which is what services/users.ts expects).
    await db.collection('memberships').deleteMany({ locationId: 'skb' });
    await db.collection('memberships').insertOne({
        userId: u._id,
        locationId: 'skb',
        role: 'owner',
        createdAt: new Date(),
    });

    const cookie = mintSessionCookie(
        { uid: u._id.toString(), lid: 'skb', role: 'owner', exp: Math.floor(Date.now() / 1000) + 3600 },
        secret,
    );
    console.log('COOKIE_PAYLOAD=' + cookie);
    await c.close();
}

main().catch(e => { console.error(e); process.exit(1); });
