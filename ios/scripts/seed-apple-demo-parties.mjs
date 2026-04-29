// Seed a few test parties on the apple-demo waitlist so App Review sees a
// populated queue when they sign in. smsConsent is false on every party so
// no SMS goes out to the fictional numbers.
const BASE = 'https://skb-waitlist.azurewebsites.net';
const LOC = 'apple-demo';

const parties = [
  { name: 'Patel',    partySize: 2, phone: '5555550101' },
  { name: 'Nguyen',   partySize: 4, phone: '5555550102' },
  { name: 'Robinson', partySize: 3, phone: '5555550103' },
  { name: 'Chen',     partySize: 2, phone: '5555550104' },
  { name: 'Garcia',   partySize: 5, phone: '5555550105' },
];

for (const p of parties) {
  const r = await fetch(`${BASE}/r/${encodeURIComponent(LOC)}/api/queue/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ ...p, smsConsent: false }),
  });
  const text = await r.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  if (r.ok) {
    console.log(`✔ ${p.name} (size ${p.partySize}) → code=${body.code} position=${body.position}`);
  } else {
    console.log(`✖ ${p.name} → ${r.status} ${typeof body === 'string' ? body : JSON.stringify(body)}`);
  }
  // Stay under the join rate limit (5/min/IP per spec).
  await new Promise((res) => setTimeout(res, 800));
}
