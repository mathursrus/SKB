// Provision a demo restaurant + host-role staff account on the SKB prod backend
// for App Store Review. Idempotent-ish: signup will 409 on re-run, so we tolerate
// that and skip ahead to the invite step assuming the owner already exists.
//
// Outputs the final reviewer credentials at the bottom in copy-pasteable form.

import crypto from 'node:crypto';

const BASE = 'https://skb-waitlist.azurewebsites.net';

// Single source of truth — change these constants if you want different demo identities.
const RESTAURANT_NAME = 'Apple Demo';
const RESTAURANT_CITY = 'Cupertino';
const OWNER = {
  name: 'Apple Demo Owner',
  email: 'apple-demo-owner@osh.app',
  password: 'AppleDemoOwner!2026',
};
const HOST = {
  email: 'apple-demo-host@osh.app',
  name: 'Apple Demo Host',
  password: 'AppleDemoHost!2026',
};

let cookieJar = '';

function recordSetCookie(headers) {
  const sc = headers.getSetCookie?.() ?? [];
  for (const c of sc) {
    const kv = c.split(';')[0];
    const name = kv.split('=')[0];
    // Replace any existing entry for this cookie name.
    cookieJar = cookieJar
      .split('; ')
      .filter((s) => s && !s.startsWith(name + '='))
      .concat([kv])
      .join('; ');
  }
}

async function http(method, path, body, opts = {}) {
  const headers = { Accept: 'application/json' };
  if (body) headers['Content-Type'] = 'application/json';
  if (cookieJar) headers.Cookie = cookieJar;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  recordSetCookie(res.headers);
  let data;
  const text = await res.text();
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok && !opts.tolerate) {
    throw new Error(`${method} ${path} → ${res.status}: ${typeof data === 'string' ? data : JSON.stringify(data)}`);
  }
  return { status: res.status, data };
}

console.log(`Using backend: ${BASE}`);
console.log(`Restaurant: "${RESTAURANT_NAME}" (${RESTAURANT_CITY})`);
console.log('');

// 1. Sign up the demo owner + restaurant.
console.log('1. POST /api/signup');
let locationId = null;
const signup = await http('POST', '/api/signup', {
  restaurantName: RESTAURANT_NAME,
  city: RESTAURANT_CITY,
  ownerName: OWNER.name,
  email: OWNER.email,
  password: OWNER.password,
  tosAccepted: true,
}, { tolerate: true });
if (signup.status === 200 || signup.status === 201) {
  locationId = signup.data?.location?.id;
  console.log(`   ✔ created location ${locationId}`);
} else if (signup.status === 409) {
  console.log(`   ⚠ already exists; logging in as owner instead`);
  const login = await http('POST', '/api/login', {
    email: OWNER.email,
    password: OWNER.password,
  });
  locationId = login.data?.locationId ?? login.data?.user?.locationId ?? null;
  if (!locationId && Array.isArray(login.data?.memberships)) {
    locationId = login.data.memberships[0]?.locationId ?? null;
  }
  if (!locationId) throw new Error(`Could not determine locationId from login response: ${JSON.stringify(login.data)}`);
  console.log(`   ✔ logged in; locationId=${locationId}`);
} else {
  throw new Error(`Unexpected signup status ${signup.status}: ${JSON.stringify(signup.data)}`);
}

// 2. Create the host invite.
console.log('');
console.log(`2. POST /r/${locationId}/api/staff/invite`);
const invite = await http('POST', `/r/${encodeURIComponent(locationId)}/api/staff/invite`, {
  email: HOST.email,
  name: HOST.name,
  role: 'host',
}, { tolerate: true });
let token = null;
if (invite.status === 200 || invite.status === 201) {
  token = invite.data?.token ?? invite.data?.invite?.token ?? null;
  console.log(`   ✔ invite created${token ? '' : ' (token not in response — check email/log)'}`);
} else if (invite.status === 409) {
  console.log(`   ⚠ host email already invited; continuing`);
} else {
  throw new Error(`Unexpected invite status ${invite.status}: ${JSON.stringify(invite.data)}`);
}

// 3. If we got a token, accept invite + set password.
if (token) {
  console.log('');
  console.log('3. POST /api/accept-invite');
  const accept = await http('POST', '/api/accept-invite', {
    token,
    password: HOST.password,
  });
  console.log(`   ✔ host account created and password set`);
} else {
  console.log('');
  console.log('3. (skipped — no token returned; host may already be a confirmed user)');
}

// 4. Verify login as host.
console.log('');
console.log('4. POST /api/login (as host)');
cookieJar = ''; // fresh session
const hostLogin = await http('POST', '/api/login', {
  email: HOST.email,
  password: HOST.password,
  locationId,
}, { tolerate: true });
if (hostLogin.status === 200) {
  console.log(`   ✔ host login works`);
} else if (hostLogin.status === 401) {
  console.log(`   ✖ host login FAILED — invite may not have been accepted; try re-running this script`);
  process.exit(1);
} else {
  console.log(`   ⚠ unexpected status ${hostLogin.status}: ${JSON.stringify(hostLogin.data)}`);
}

console.log('');
console.log('────────── REVIEWER CREDENTIALS ──────────');
console.log(`Backend     : ${BASE}`);
console.log(`Location ID : ${locationId}`);
console.log(`Email       : ${HOST.email}`);
console.log(`Password    : ${HOST.password}`);
console.log('──────────────────────────────────────────');
