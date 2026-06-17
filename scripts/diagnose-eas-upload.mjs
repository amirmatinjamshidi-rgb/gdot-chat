/**
 * Diagnose EAS Build upload (Expo GraphQL + GCS presigned PUT).
 * Writes NDJSON to eas-upload-diagnostic.log (gitignored).
 * Run: node scripts/diagnose-eas-upload.mjs
 *
 * If H3 shows 403, GCS is blocked from this machine — use VPN/proxy
 * (set https_proxy for eas-cli) or build from GitHub Actions.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOG = path.join(__dirname, '..', 'eas-upload-diagnostic.log');

function log(hypothesisId, message, data = {}) {
  const line = JSON.stringify({
    runId: 'eas-upload-diagnose',
    hypothesisId,
    location: 'scripts/diagnose-eas-upload.mjs',
    message,
    data,
    timestamp: Date.now(),
  });
  fs.appendFileSync(LOG, line + '\n');
  console.log(`[${hypothesisId}] ${message}`, data);
}

async function main() {
  log('H0', 'diagnostic_start', { node: process.version });

  try {
    const { execSync } = await import('child_process');
    const whoami = execSync('npx eas whoami 2>&1', { encoding: 'utf8' }).trim();
    log('H1', 'eas_whoami', { ok: true, output: whoami.split('\n').slice(0, 3) });
  } catch (e) {
    log('H1', 'eas_whoami', { ok: false, error: String(e.message || e) });
  }

  const tokenPath = path.join(
    process.env.USERPROFILE || process.env.HOME || '',
    '.expo',
    'state.json'
  );
  let sessionSecret = null;
  if (fs.existsSync(tokenPath)) {
    try {
      const state = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
      sessionSecret = state?.auth?.sessionSecret ?? null;
    } catch {
      /* ignore */
    }
  }
  log('H1', 'session_present', {
    hasSession: Boolean(sessionSecret),
    hasExpoTokenEnv: Boolean(process.env.EXPO_TOKEN),
    httpsProxySet: Boolean(process.env.HTTPS_PROXY || process.env.https_proxy),
  });

  const graphqlQuery = {
    query: `mutation CreateUploadSessionMutation($type: UploadSessionType!) {
      uploadSession {
        createUploadSession(type: $type)
      }
    }`,
    variables: { type: 'EAS_BUILD_GCS_PROJECT_SOURCES' },
  };

  try {
    const authHeaders = process.env.EXPO_TOKEN
      ? { Authorization: `Bearer ${process.env.EXPO_TOKEN}` }
      : sessionSecret
        ? { 'expo-session': sessionSecret }
        : {};
    const res = await fetch('https://api.expo.dev/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
      },
      body: JSON.stringify(graphqlQuery),
    });
    const gqlBody = await res.text();
    let parsed = null;
    try {
      parsed = JSON.parse(gqlBody);
    } catch {
      /* ignore */
    }
    const session = parsed?.data?.uploadSession?.createUploadSession;
    log('H2', 'graphql_upload_session', {
      status: res.status,
      hasUploadUrl: Boolean(session?.url),
      errors: parsed?.errors?.map((e) => e.message)?.slice(0, 2) ?? null,
      urlHost: session?.url ? new URL(session.url).host : null,
    });

    if (session?.url) {
      const { url, headers } = session;
      const testBody = Buffer.from('eas-upload-test');
      try {
        const putRes = await fetch(url, {
          method: 'PUT',
          headers: { ...headers, 'Content-Length': String(testBody.length) },
          body: testBody,
        });
        let gcsBodyHint = null;
        if (!putRes.ok) {
          const t = await putRes.text();
          gcsBodyHint = t.replace(/\s+/g, ' ').slice(0, 400);
        }
        log('H3', 'gcs_put_test', {
          status: putRes.status,
          statusText: putRes.statusText,
          ok: putRes.ok,
          bodyHint: gcsBodyHint,
        });
      } catch (e) {
        log('H3', 'gcs_put_test', { ok: false, error: String(e.message || e) });
      }
    } else {
      log('H3', 'gcs_put_test', { skipped: true, reason: 'no_presigned_url' });
    }
  } catch (e) {
    log('H2', 'graphql_upload_session', { ok: false, error: String(e.message || e) });
  }

  for (const host of ['storage.googleapis.com', 'dl.google.com']) {
    try {
      const res = await fetch(`https://${host}/`, { method: 'HEAD' });
      log('H4', 'host_reachable', { host, status: res.status });
    } catch (e) {
      log('H4', 'host_reachable', { host, ok: false, error: String(e.message || e) });
    }
  }

  log('H0', 'diagnostic_complete', {});
}

main().catch((e) => {
  log('H0', 'diagnostic_crash', { error: String(e.message || e) });
  process.exit(1);
});
