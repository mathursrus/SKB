import { MongoClient } from 'mongodb';
const c = new MongoClient('mongodb://localhost:27017');
await c.connect();
const doc = await c.db('skb_issue_51').collection('locations').findOne({ _id: 'abcd' });
console.log('PIN:', doc?.pin);
await c.close();
