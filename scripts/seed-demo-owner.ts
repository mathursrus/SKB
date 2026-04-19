// Create a demo owner account seeded for Sid + testers.
// Idempotent: safe to re-run.
//
//   Email:    demo@osh.test
//   Password: OshDemo2026!
//   Tenant:   skb   (role: owner)
//
// Usage:
//   SKB_COOKIE_SECRET=... npx tsx scripts/seed-demo-owner.ts
import { getDb } from '../src/core/db/mongo.js';
import { hashPassword } from '../src/services/users.js';
import { ObjectId } from 'mongodb';

const DEMO_EMAIL = 'demo@osh.test';
const DEMO_PASSWORD = 'OshDemo2026!';
// Memberships to provision. `skb` gets owner (original default tenant);
// `abcd` gets admin (the multi-tenant demo set up during issue #51).
const DEMO_MEMBERSHIPS: Array<{ locationId: string; role: 'owner' | 'admin' }> = [
    { locationId: 'skb', role: 'owner' },
    { locationId: 'abcd', role: 'admin' },
];

async function main() {
    const db = await getDb();
    const users = db.collection('users');
    const memberships = db.collection('memberships');

    // Ensure user exists with the known password.
    const existing = await users.findOne({ email: DEMO_EMAIL });
    let userId: ObjectId;
    const passwordHash = await hashPassword(DEMO_PASSWORD);
    if (existing) {
        userId = existing._id as unknown as ObjectId;
        await users.updateOne(
            { _id: existing._id },
            { $set: { passwordHash, name: 'OSH Demo', updatedAt: new Date() } },
        );
        console.log('[seed-demo-owner] updated existing user', userId.toString());
    } else {
        const now = new Date();
        const doc = {
            email: DEMO_EMAIL,
            passwordHash,
            name: 'OSH Demo',
            createdAt: now,
            updatedAt: now,
            tosAcceptedAt: now,
        };
        const r = await users.insertOne(doc);
        userId = r.insertedId as ObjectId;
        console.log('[seed-demo-owner] created user', userId.toString());
    }

    // Ensure each listed membership is present with the right role.
    for (const m of DEMO_MEMBERSHIPS) {
        const existingMem = await memberships.findOne({ userId, locationId: m.locationId });
        if (existingMem) {
            if (existingMem.role !== m.role || existingMem.revokedAt) {
                await memberships.updateOne(
                    { _id: existingMem._id },
                    { $set: { role: m.role }, $unset: { revokedAt: '' } },
                );
                console.log(`[seed-demo-owner] set ${m.role} on ${m.locationId}`);
            } else {
                console.log(`[seed-demo-owner] already ${m.role} on ${m.locationId}`);
            }
        } else {
            await memberships.insertOne({
                userId,
                locationId: m.locationId,
                role: m.role,
                createdAt: new Date(),
            });
            console.log(`[seed-demo-owner] created ${m.role} on ${m.locationId}`);
        }
    }

    console.log('');
    console.log('  Demo account ready');
    console.log('  ───────────────────────────────');
    console.log(`  Email:    ${DEMO_EMAIL}`);
    console.log(`  Password: ${DEMO_PASSWORD}`);
    for (const m of DEMO_MEMBERSHIPS) {
        console.log(`  URL:      http://localhost:3000/r/${m.locationId}/admin.html   (role: ${m.role})`);
    }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
