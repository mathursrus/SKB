// Fetch a single EAS submission record (status + log URL) via GraphQL.
// Usage: node scripts/eas-submission-view.mjs <submissionId>
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const id = process.argv[2];
if (!id) { console.error('usage: node eas-submission-view.mjs <submissionId>'); process.exit(2); }

const state = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.expo', 'state.json'), 'utf8'));
const session = state.auth?.sessionSecret;
if (!session) { console.error('no expo session in ~/.expo/state.json — run `eas login`'); process.exit(2); }

// Use introspection to find every field on Submission, then ask for all.
const introspect = `
{ __type(name: "Submission") { fields { name type { name kind ofType { name kind } } } } }`;

const ir = await fetch('https://api.expo.dev/graphql', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'expo-session': session },
  body: JSON.stringify({ query: introspect }),
});
const ij = await ir.json();
const fields = ij.data.__type.fields;
console.error('Submission fields:', fields.map((f) => f.name).join(', '));
console.error('');

const scalarFields = fields.filter((f) => {
  const t = f.type.kind === 'NON_NULL' || f.type.kind === 'LIST' ? f.type.ofType : f.type;
  return t && (t.kind === 'SCALAR' || t.kind === 'ENUM');
}).map((f) => f.name);

// Inspect JobRun to find log/error fields too
const jrIntro = await fetch('https://api.expo.dev/graphql', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'expo-session': session },
  body: JSON.stringify({ query: `{ __type(name: "JobRun") { fields { name type { name kind ofType { name kind } } } } }` }),
});
const jrJson = await jrIntro.json();
const jrFields = jrJson.data.__type?.fields || [];
console.error('JobRun fields:', jrFields.map((f) => f.name).join(', '));
const jrScalars = jrFields.filter((f) => {
  const t = f.type.kind === 'NON_NULL' || f.type.kind === 'LIST' ? f.type.ofType : f.type;
  return t && (t.kind === 'SCALAR' || t.kind === 'ENUM');
}).map((f) => f.name);

const query = `
query SubmissionByIdQuery($id: ID!) {
  submissions {
    byId(submissionId: $id) {
      ${scalarFields.join('\n      ')}
      submittedBuild { id appVersion appBuildVersion }
      error { errorCode message }
      jobRun { ${jrScalars.join(' ')} logFileUrls errors { errorCode message } }
    }
  }
}`;

const r = await fetch('https://api.expo.dev/graphql', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'expo-session': session,
  },
  body: JSON.stringify({ query, variables: { id } }),
});
const json = await r.json();
console.log(JSON.stringify(json, null, 2));

const sub = json?.data?.submissions?.byId;
if (sub?.logFiles?.length) {
  console.log(`\nFetching first log file: ${sub.logFiles[0]}`);
  const lr = await fetch(sub.logFiles[0]);
  const text = await lr.text();
  console.log('--- log ---');
  console.log(text);
  console.log('--- end log ---');
}
