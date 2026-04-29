// Detach the currently attached build from the editable appStoreVersion,
// then re-attach the latest VALID build. Used as a nudge to force ASC's
// UI to re-extract the listing's app icon when it has cached a stale one.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const eas = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'eas.json'), 'utf8'));
const sub = eas.submit.production.ios;
const keyPath = path.resolve(path.join(__dirname, '..'), sub.ascApiKeyPath);
const privateKey = fs.readFileSync(keyPath, 'utf8');

const header = Buffer.from(JSON.stringify({ alg: 'ES256', kid: sub.ascApiKeyId, typ: 'JWT' })).toString('base64url');
const now = Math.floor(Date.now() / 1000);
const payload = Buffer.from(JSON.stringify({ iss: sub.ascApiKeyIssuerId, iat: now, exp: now + 20 * 60, aud: 'appstoreconnect-v1' })).toString('base64url');
const signingInput = `${header}.${payload}`;
const sigDer = crypto.createSign('SHA256').update(signingInput).sign({ key: privateKey, dsaEncoding: 'ieee-p1363' });
const jwt = `${signingInput}.${sigDer.toString('base64url')}`;

async function asc(method, p, body) {
  const r = await fetch(`https://api.appstoreconnect.apple.com${p}`, {
    method, headers: { Authorization: `Bearer ${jwt}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}: ${await r.text()}`);
  return r.status === 204 ? null : r.json();
}

const versions = await asc('GET', `/v1/apps/${sub.ascAppId}/appStoreVersions?limit=10&fields[appStoreVersions]=versionString,appStoreState`);
const target = versions.data.find((v) => ['PREPARE_FOR_SUBMISSION', 'DEVELOPER_REJECTED', 'METADATA_REJECTED'].includes(v.attributes.appStoreState));
if (!target) { console.error('No editable App Store version'); process.exit(1); }
console.log(`Listing: v${target.attributes.versionString} (${target.attributes.appStoreState})`);

console.log('Detaching current build…');
await asc('PATCH', `/v1/appStoreVersions/${target.id}/relationships/build`, { data: null });
await new Promise((r) => setTimeout(r, 1500));

const builds = await asc('GET', `/v1/builds?filter[app]=${sub.ascAppId}&limit=20&include=preReleaseVersion&fields[builds]=version,uploadedDate,processingState,preReleaseVersion&fields[preReleaseVersions]=version`);
const preRel = new Map((builds.included ?? []).filter((x) => x.type === 'preReleaseVersions').map((x) => [x.id, x.attributes.version]));
const sorted = builds.data.map((b) => ({ id: b.id, buildNumber: b.attributes.version, marketing: preRel.get(b.relationships?.preReleaseVersion?.data?.id), state: b.attributes.processingState, uploaded: b.attributes.uploadedDate })).filter((b) => b.state === 'VALID' && b.marketing === target.attributes.versionString).sort((a, b) => new Date(b.uploaded) - new Date(a.uploaded));
const latest = sorted[0];
if (!latest) { console.error('No matching VALID build'); process.exit(1); }
console.log(`Re-attaching build #${latest.buildNumber} (${latest.id})…`);
await asc('PATCH', `/v1/appStoreVersions/${target.id}/relationships/build`, { data: { type: 'builds', id: latest.id } });
console.log(`✔ Re-attached.`);
