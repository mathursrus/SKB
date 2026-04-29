// Update the ASC App Store version's versionString to match the latest build's
// CFBundleShortVersionString, so eas submit can attach the binary cleanly.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const eas = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'eas.json'), 'utf8'));
const sub = eas.submit.production.ios;
const keyPath = path.resolve(path.join(__dirname, '..'), sub.ascApiKeyPath);
const privateKey = fs.readFileSync(keyPath, 'utf8');

const newVersion = process.argv[2];
if (!newVersion) { console.error('usage: node asc-set-version-string.mjs <new-version-string>  (e.g. 1.0.0)'); process.exit(2); }

const header = Buffer.from(JSON.stringify({ alg: 'ES256', kid: sub.ascApiKeyId, typ: 'JWT' })).toString('base64url');
const now = Math.floor(Date.now() / 1000);
const payload = Buffer.from(JSON.stringify({
  iss: sub.ascApiKeyIssuerId,
  iat: now,
  exp: now + 20 * 60,
  aud: 'appstoreconnect-v1',
})).toString('base64url');
const signingInput = `${header}.${payload}`;
const sigDer = crypto.createSign('SHA256').update(signingInput).sign({ key: privateKey, dsaEncoding: 'ieee-p1363' });
const jwt = `${signingInput}.${sigDer.toString('base64url')}`;

async function asc(method, p, body) {
  const r = await fetch(`https://api.appstoreconnect.apple.com${p}`, {
    method,
    headers: { Authorization: `Bearer ${jwt}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}: ${await r.text()}`);
  if (r.status === 204) return null;
  return r.json();
}

const versions = await asc('GET', `/v1/apps/${sub.ascAppId}/appStoreVersions?limit=10&fields[appStoreVersions]=versionString,appStoreState`);
const editable = versions.data.filter((v) => ['PREPARE_FOR_SUBMISSION', 'DEVELOPER_REJECTED', 'METADATA_REJECTED'].includes(v.attributes.appStoreState));
if (editable.length === 0) { console.error('No editable App Store version found'); process.exit(1); }
const target = editable[0];
console.log(`Updating version ${target.id} (currently "${target.attributes.versionString}", state ${target.attributes.appStoreState}) → "${newVersion}"`);

await asc('PATCH', `/v1/appStoreVersions/${target.id}`, {
  data: { type: 'appStoreVersions', id: target.id, attributes: { versionString: newVersion } },
});
console.log(`✔ versionString updated to ${newVersion}`);
