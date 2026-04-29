// Attach the most recently uploaded build to the matching App Store version.
// Picks the newest build whose CFBundleShortVersionString equals an existing
// appStoreVersion's versionString and PATCHes the version's build relationship.
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
const payload = Buffer.from(JSON.stringify({
  iss: sub.ascApiKeyIssuerId,
  iat: now,
  exp: now + 20 * 60,
  aud: 'appstoreconnect-v1',
})).toString('base64url');
const signingInput = `${header}.${payload}`;
const sigDer = crypto.createSign('SHA256').update(signingInput).sign({ key: privateKey, dsaEncoding: 'ieee-p1363' });
const jwt = `${signingInput}.${sigDer.toString('base64url')}`;

async function asc(method, pathAndQuery, body) {
  const r = await fetch(`https://api.appstoreconnect.apple.com${pathAndQuery}`, {
    method,
    headers: {
      Authorization: `Bearer ${jwt}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}: ${await r.text()}`);
  if (r.status === 204) return null;
  return r.json();
}

const appId = sub.ascAppId;

const builds = await asc('GET', `/v1/builds?filter[app]=${appId}&limit=20&include=preReleaseVersion&fields[builds]=version,uploadedDate,processingState,preReleaseVersion&fields[preReleaseVersions]=version`);
const preReleaseVersions = new Map((builds.included ?? [])
  .filter((x) => x.type === 'preReleaseVersions')
  .map((x) => [x.id, x.attributes.version]));
const sorted = builds.data
  .map((b) => ({
    id: b.id,
    buildNumber: b.attributes.version,
    uploadedDate: b.attributes.uploadedDate,
    processingState: b.attributes.processingState,
    marketingVersion: preReleaseVersions.get(b.relationships?.preReleaseVersion?.data?.id) ?? null,
  }))
  .sort((a, b) => new Date(b.uploadedDate) - new Date(a.uploadedDate));
const latest = sorted[0];
if (!latest) { console.error('No builds found in ASC'); process.exit(1); }
console.log(`Latest build: id=${latest.id}  marketingVersion="${latest.marketingVersion}"  buildNumber="${latest.buildNumber}"  state=${latest.processingState}  uploaded=${latest.uploadedDate}`);

if (latest.processingState !== 'VALID') {
  console.error(`\nLatest build is not VALID yet (state=${latest.processingState}). Re-run when state=VALID.`);
  process.exit(1);
}

const versions = await asc('GET', `/v1/apps/${appId}/appStoreVersions?limit=10&fields[appStoreVersions]=versionString,appStoreState`);
const targetVersionString = latest.marketingVersion;
const target = versions.data.find((v) => v.attributes.versionString === targetVersionString);

if (!target) {
  console.error(`No App Store version with versionString="${targetVersionString}" found. Existing versions:`);
  for (const v of versions.data) console.error(`  - v${v.attributes.versionString} (${v.attributes.appStoreState})`);
  process.exit(1);
}

console.log(`Target listing: id=${target.id}  v${target.attributes.versionString}  state=${target.attributes.appStoreState}`);
const editableStates = ['PREPARE_FOR_SUBMISSION', 'DEVELOPER_REJECTED', 'REJECTED', 'METADATA_REJECTED', 'INVALID_BINARY'];
if (!editableStates.includes(target.attributes.appStoreState)) {
  console.error(`Listing is not in an editable state (${target.attributes.appStoreState}); cannot attach build.`);
  process.exit(1);
}

await asc('PATCH', `/v1/appStoreVersions/${target.id}/relationships/build`, {
  data: { type: 'builds', id: latest.id },
});

console.log(`\n✔ Attached build ${latest.id} (v${latest.marketingVersion} #${latest.buildNumber}) to App Store version ${target.id}.`);
