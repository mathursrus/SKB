// One-shot ASC status check: lists builds + their TestFlight processing state.
// Reads the API key from eas.json's submit profile path.
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

async function asc(pathAndQuery) {
  const r = await fetch(`https://api.appstoreconnect.apple.com${pathAndQuery}`, {
    headers: { Authorization: `Bearer ${jwt}` },
  });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}: ${await r.text()}`);
  return r.json();
}

const appId = sub.ascAppId;
const builds = await asc(`/v1/builds?filter[app]=${appId}&limit=10&sort=-uploadedDate&fields[builds]=version,uploadedDate,expired,processingState,usesNonExemptEncryption,minOsVersion`);

console.log(`App: ${appId}`);
console.log(`Builds in App Store Connect: ${builds.data.length}\n`);
for (const b of builds.data) {
  const a = b.attributes;
  console.log(`- build ${a.version}  state=${a.processingState}  uploaded=${a.uploadedDate}  expired=${a.expired}  minIOS=${a.minOsVersion}`);
}

// Also check app-level state for any pending submission
const versions = await asc(`/v1/apps/${appId}/appStoreVersions?limit=5&include=build&fields[appStoreVersions]=versionString,appStoreState,createdDate,platform,releaseType,build&fields[builds]=version`);
console.log(`\nApp Store versions: ${versions.data.length}`);
const buildIndex = new Map((versions.included ?? []).filter((x) => x.type === 'builds').map((x) => [x.id, x.attributes.version]));
for (const v of versions.data) {
  const a = v.attributes;
  const buildRel = v.relationships?.build?.data;
  const attachedBuild = buildRel ? buildIndex.get(buildRel.id) ?? buildRel.id : '(no build attached)';
  console.log(`- v${a.versionString}  state=${a.appStoreState}  platform=${a.platform}  releaseType=${a.releaseType}  build=${attachedBuild}`);
}
