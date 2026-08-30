// Staging behavior matrix for blog comments -- plans/comments-staging-test.md
// phase 1. Runs the full risk-stack, email-chain, and CRUD probe set against
// the staging worker pair and prints a pass/fail table.
//
//   bun scripts/comments-staging-e2e.ts
//
// Requirements: `bunx wrangler login` done (D1/KV asserts run remotely), the
// staging secrets file from the rehearsal, and RESEND_API_KEY in .env.local.
// Secrets are read to mint tokens locally; their values are never printed.
//
// Budget note: comment creation is rate limited 3/min and 10/hour per IP
// (denied attempts may also consume), so the create probes are paced into
// three <=3-per-minute batches and the whole matrix fits exactly 10 attempts.
// Do not add a create probe without removing one.

import { createHash, createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';

const ORIGIN = process.env.STAGING_ORIGIN ?? 'https://site-staging-9669e7.bunizao.workers.dev';
const POST_ID = process.env.STAGING_POST_ID ?? '66c8bb3d5614b50001db93c6';
const STAGING_DB = 'site-notify-staging';
const STAGING_CACHE_KV_ID = '36565fb806ef4fb9b34dddf04f45a070';
const SITE_API_DIR = process.env.SITE_API_DIR ?? '/Users/tutu/Dev/site-api/.claude/worktrees/blog-comments';
const SECRETS_FILE = process.env.STAGING_SECRETS_FILE ?? `${SITE_API_DIR}/.wrangler/rehearsal/staging-secrets.env`;
const TURNSTILE_DUMMY = 'XXXX.DUMMY.TOKEN.XXXX';
const RUN = Date.now().toString(36);

// -- secrets ----------------------------------------------------------------

function readEnvFile(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  let text = '';
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    return out;
  }
  for (const line of text.split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].replace(/^"|"$/g, '');
  }
  return out;
}

const stagingSecrets = readEnvFile(SECRETS_FILE);
const SESSION_SECRET = stagingSecrets.COMMENTS_SESSION_SECRET;
const EMAIL_SECRET = stagingSecrets.COMMENTS_EMAIL_SECRET;
const localEnv = readEnvFile('.env.local');
const RESEND_KEY = localEnv.RESEND_API_KEY ?? readEnvFile('/Users/tutu/Dev/site/.env.local').RESEND_API_KEY ?? '';
if (!SESSION_SECRET || !EMAIL_SECRET) {
  console.error('missing COMMENTS_* secrets in', SECRETS_FILE);
  process.exit(1);
}

// -- token minting (mirrors site-api src/lib/email-challenge.ts) ------------

function mintToken(payload: object, secret: string): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = createHmac('sha256', secret).update(encoded).digest('base64url');
  return `${encoded}.${sig}`;
}

/** Pre-aged dwell token: t is 10s in the past, comfortably over MIN_DWELL_MS. */
function agedDwell(): string {
  const now = Date.now();
  return mintToken({ t: now - 10_000, exp: Math.floor((now + 60_000) / 1000) }, SESSION_SECRET);
}

/** Dwell token minted "just now" -- younger than MIN_DWELL_MS. */
function youngDwell(): string {
  const now = Date.now();
  return mintToken({ t: now, exp: Math.floor((now + 60_000) / 1000) }, SESSION_SECRET);
}

function mintVerify(email: string, subscribe: boolean, expOffsetSec = 3600): string {
  return mintToken(
    {
      purpose: 'reader_verify',
      email: email.trim().toLowerCase(),
      displayName: 'E2E Probe',
      subscribe,
      exp: Math.floor(Date.now() / 1000) + expOffsetSec,
    },
    EMAIL_SECRET,
  );
}

function emailHash(email: string): string {
  return createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
}

// -- http with per-identity cookie jars -------------------------------------

interface Jar {
  cookies: Map<string, string>;
  ua: string;
}

function jar(name: string): Jar {
  return { cookies: new Map(), ua: `comments-e2e/${name}` };
}

async function call(
  j: Jar,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; json: any; text: string }> {
  // Browsers send Origin on every non-GET fetch; without it Astro's CSRF
  // check rejects a body-less DELETE as a cross-site form submission.
  const headers: Record<string, string> = { 'user-agent': j.ua, origin: ORIGIN };
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (j.cookies.size) {
    headers.cookie = [...j.cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
  }
  const res = await fetch(`${ORIGIN}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  for (const sc of res.headers.getSetCookie?.() ?? []) {
    const m = sc.match(/^([^=]+)=([^;]*)/);
    if (m) j.cookies.set(m[1], m[2]);
  }
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return { status: res.status, json, text };
}

// -- wrangler shell-outs ----------------------------------------------------

function d1(sql: string): any[] {
  const proc = Bun.spawnSync(
    ['bunx', 'wrangler', 'd1', 'execute', STAGING_DB, '--remote', '--json', '--command', sql],
    { cwd: SITE_API_DIR, stdout: 'pipe', stderr: 'pipe' },
  );
  const out = proc.stdout.toString();
  const start = out.indexOf('[');
  if (start === -1) throw new Error(`d1 execute failed: ${proc.stderr.toString().slice(0, 400)}`);
  const parsed = JSON.parse(out.slice(start));
  return parsed[0]?.results ?? [];
}

function kvPut(key: string, value: string): void {
  const proc = Bun.spawnSync(
    ['bunx', 'wrangler', 'kv', 'key', 'put', key, value, '--namespace-id', STAGING_CACHE_KV_ID, '--remote'],
    { cwd: SITE_API_DIR, stdout: 'pipe', stderr: 'pipe' },
  );
  if (proc.exitCode !== 0) throw new Error(`kv put failed: ${proc.stderr.toString().slice(0, 400)}`);
}

function secretPut(name: string, value: string): void {
  const proc = Bun.spawnSync(['bunx', 'wrangler', 'secret', 'put', name, '--name', 'site-api-staging'], {
    cwd: SITE_API_DIR,
    stdin: new TextEncoder().encode(value),
    stdout: 'pipe',
    stderr: 'pipe',
  });
  if (proc.exitCode !== 0) throw new Error(`secret put failed: ${proc.stderr.toString().slice(0, 400)}`);
}

// -- probe bookkeeping ------------------------------------------------------

interface Row {
  id: string;
  name: string;
  outcome: 'PASS' | 'FAIL' | 'SKIP';
  note: string;
}
const rows: Row[] = [];

function record(id: string, name: string, pass: boolean, note: string) {
  rows.push({ id, name, outcome: pass ? 'PASS' : 'FAIL', note });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${id}  ${name}  ${note}`);
}

function skip(id: string, name: string, note: string) {
  rows.push({ id, name, outcome: 'SKIP', note });
  console.log(`SKIP  ${id}  ${name}  ${note}`);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function createBody(j: Jar, over: Record<string, unknown>) {
  return {
    postId: POST_ID,
    body: `probe default body ${RUN}`,
    displayName: 'E2E Probe',
    email: 'bunizaoccc+stg1@gmail.com',
    turnstileToken: TURNSTILE_DUMMY,
    dwellToken: agedDwell(),
    ...over,
  };
}

function dbRow(id: string): any | null {
  const r = d1(`SELECT id, status, reader_id, parent_id, body FROM blog_comments WHERE id = '${id.replace(/'/g, '')}'`);
  return r[0] ?? null;
}

// -- identities -------------------------------------------------------------

const E1 = 'bunizaoccc+stg1@gmail.com'; // anon author, later claims via verify
const E2 = 'bunizaoccc+stg2@gmail.com'; // verified reader (locally minted token)
const E4 = 'bunizaoccc+stgban@gmail.com'; // shadow-banned
const DISPOSABLE = `probe-${RUN}@yopmail.com`;

const jE1 = jar('e1');
const jE2 = jar('e2');
const jE4 = jar('e4');
const jDisp = jar('disp');
const jLink = jar('link'); // fresh session, first_time_link probe
const jMisc = jar('misc'); // no-budget probes (fakes, 400s)

// ===========================================================================

async function main() {
  console.log(`origin=${ORIGIN} post=${POST_ID} run=${RUN}\n`);

  // -- 0. preflight: AI key validity decides publish-path expectations ------
  let aiUp = false;
  const aiKey =
    readEnvFile(`${SITE_API_DIR}/.env.local`).AI_API_KEY ??
    readEnvFile('/Users/tutu/Dev/site-api/.env.local').AI_API_KEY ??
    '';
  if (aiKey) {
    const r = await fetch('https://api.openai.com/v1/models', {
      headers: { authorization: `Bearer ${aiKey}` },
    });
    aiUp = r.status === 200;
  }
  console.log(`AI moderation key: ${aiUp ? 'VALID (publish path live)' : 'INVALID/absent (fail-closed: everything holds)'}\n`);
  const benignOutcome = aiUp ? 'published' : 'held';

  // -- 1. zero-budget request-shape probes ----------------------------------
  {
    const r = await call(jMisc, 'GET', '/api/v2/comments/dwell-token');
    const parts = String(r.json?.token ?? '').split('.');
    let parity = false;
    if (parts.length === 2) {
      const sig = createHmac('sha256', SESSION_SECRET).update(parts[0]).digest('base64url');
      parity = sig === parts[1];
    }
    record('P1', 'dwell-token endpoint mints, secret parity', r.status === 200 && parity, `status=${r.status} parity=${parity}`);
  }
  {
    const b = createBody(jMisc, {});
    delete (b as any).dwellToken;
    const r = await call(jMisc, 'POST', '/api/v2/comments', b);
    record('P3', 'missing dwellToken -> 400', r.status === 400, `status=${r.status} error=${r.json?.error}`);
  }
  {
    const r = await call(jMisc, 'POST', '/api/v2/comments', createBody(jMisc, { dwellToken: youngDwell(), body: `too fast ${RUN}` }));
    const fake = r.status === 201 && r.json?.outcome === 'held' && !dbRow(r.json?.comment?.id ?? 'x');
    record('P4', 'young dwell -> fake held, no DB row', fake, `status=${r.status} outcome=${r.json?.outcome}`);
  }
  {
    const r = await call(jMisc, 'POST', '/api/v2/comments', createBody(jMisc, { website: 'https://spam.example', body: `honeypot ${RUN}` }));
    const fake = r.status === 201 && r.json?.outcome === 'held' && !dbRow(r.json?.comment?.id ?? 'x');
    record('P5', 'honeypot filled -> fake held, no DB row', fake, `status=${r.status} outcome=${r.json?.outcome}`);
  }
  {
    const r = await call(jMisc, 'POST', '/api/v2/comments', createBody(jMisc, { body: 'x'.repeat(2001) }));
    record('P6', 'body over 2000 chars -> 400', r.status === 400, `status=${r.status}`);
  }
  {
    const r = await call(jMisc, 'POST', '/api/v2/comments', createBody(jMisc, { postId: 'ffffffffffffffffffffffff', body: `bad post ${RUN}` }));
    record('P7', 'unknown postId -> 404', r.status === 404, `status=${r.status} error=${r.json?.error}`);
  }

  // -- 2. shadow-ban KV seed (before E4's create) ---------------------------
  kvPut(`comments:shadowban:${emailHash(E4)}`, JSON.stringify({ reason: 'e2e probe', at: new Date().toISOString() }));
  console.log('\nshadow-ban KV seeded for E4\n');

  // -- 3. create batch 1 (attempts 1-4; 4th trips the minute window) --------
  let c1: any = null;
  {
    const r = await call(jE1, 'POST', '/api/v2/comments', createBody(jE1, { email: E1, body: `C1 benign root comment ${RUN}`, notifyReplies: true }));
    c1 = r.json?.comment ?? null;
    const row = c1 ? dbRow(c1.id) : null;
    const ok = r.status === 201 && r.json?.outcome === benignOutcome && !!row && row.status === benignOutcome && r.json?.unverifiedEmail === true;
    record('C1', `anon benign create -> ${benignOutcome} + DB row + unverifiedEmail`, ok, `status=${r.status} outcome=${r.json?.outcome} db=${row?.status} unverified=${r.json?.unverifiedEmail}`);
  }
  {
    const r = await call(jE1, 'POST', '/api/v2/comments', createBody(jE1, { email: E1, body: `C2 links ${RUN} https://a.example https://b.example https://c.example` }));
    const row = r.json?.comment ? dbRow(r.json.comment.id) : null;
    record('C2', 'three links -> real held row (link_count)', r.status === 201 && r.json?.outcome === 'held' && row?.status === 'held', `status=${r.status} db=${row?.status ?? 'missing'}`);
  }
  let c3: any = null;
  {
    const r = await call(jE1, 'POST', '/api/v2/comments', createBody(jE1, { email: E1, body: `C3 buy cheap viagra now ${RUN}` }));
    c3 = r.json?.comment ?? null;
    const row = c3 ? dbRow(c3.id) : null;
    record('C3', 'keyword blocklist -> real held row', r.status === 201 && r.json?.outcome === 'held' && row?.status === 'held', `status=${r.status} db=${row?.status ?? 'missing'}`);
  }
  {
    const r = await call(jDisp, 'POST', '/api/v2/comments', createBody(jDisp, { email: DISPOSABLE, body: `C4a disposable ${RUN}` }));
    record('C4a', '4th create in a minute -> 429', r.status === 429, `status=${r.status}`);
  }

  // -- 4. zero-budget: duplicate body (drops before rate limit) -------------
  {
    const r = await call(jMisc, 'POST', '/api/v2/comments', createBody(jMisc, { email: E2, body: `C1 benign root comment ${RUN}` }));
    const fake = r.status === 201 && r.json?.outcome === 'held' && !dbRow(r.json?.comment?.id ?? 'x');
    record('P8', 'duplicate body -> fake held, no DB row', fake, `status=${r.status} outcome=${r.json?.outcome}`);
  }

  // -- 5. verify chain (no create budget) -----------------------------------
  let e1TokenFromEmail: string | null = null;
  if (RESEND_KEY) {
    // Real email chain: find the verify mail Resend sent to E1 and pull the
    // token out of it. List endpoint availability is probed at runtime.
    await sleep(3000);
    const list = await fetch('https://api.resend.com/emails', { headers: { authorization: `Bearer ${RESEND_KEY}` } });
    if (list.status === 200) {
      const data: any = await list.json();
      const mail = (data?.data ?? []).find((m: any) => (Array.isArray(m.to) ? m.to : [m.to]).includes(E1));
      if (mail) {
        const detail: any = await (await fetch(`https://api.resend.com/emails/${mail.id}`, { headers: { authorization: `Bearer ${RESEND_KEY}` } })).json();
        const m = String(detail?.html ?? '').match(/token=([A-Za-z0-9_\-.%]+)/);
        if (m) e1TokenFromEmail = decodeURIComponent(m[1]);
      }
      record('M1', 'verify email delivered to E1 via Resend', !!mail, mail ? `resend id=${mail.id}` : 'no mail to E1 found');
    } else {
      skip('M1', 'verify email via Resend list API', `list endpoint status=${list.status}; check inbox manually`);
    }
  } else {
    skip('M1', 'verify email via Resend list API', 'no RESEND_API_KEY in .env.local');
  }

  {
    // E2: locally minted token, subscribe=true -> confirmed + session cookie.
    const r = await call(jE2, 'POST', '/api/v2/reader/verify', { token: mintVerify(E2, true) });
    const ok = r.status === 200 && r.json?.outcome === 'confirmed' && jE2.cookies.size > 0;
    record('V1', 'verify minted token -> confirmed + session cookie', ok, `status=${r.status} outcome=${r.json?.outcome} cookies=${jE2.cookies.size}`);
  }
  {
    const r = await call(jE2, 'POST', '/api/v2/reader/verify', { token: mintVerify(E2, true) });
    record('V2', 're-verify same email -> already_confirmed', r.status === 200 && r.json?.outcome === 'already_confirmed', `outcome=${r.json?.outcome}`);
  }
  {
    const t = mintVerify(E2, false);
    const tampered = t.slice(0, -4) + (t.endsWith('AAAA') ? 'BBBB' : 'AAAA');
    const r = await call(jMisc, 'POST', '/api/v2/reader/verify', { token: tampered });
    record('V3', 'tampered token -> invalid', r.json?.outcome === 'invalid', `status=${r.status} outcome=${r.json?.outcome}`);
  }
  {
    const r = await call(jMisc, 'POST', '/api/v2/reader/verify', { token: mintVerify(E2, false, -60) });
    record('V4', 'expired token -> invalid', r.json?.outcome === 'invalid', `status=${r.status} outcome=${r.json?.outcome}`);
  }
  {
    const subs = d1(`SELECT status FROM notify_subscribers WHERE email_hash = '${emailHash(E2)}'`);
    record('V5', 'verify with subscribe=true -> subscriber row', subs.length === 1, `rows=${subs.length} status=${subs[0]?.status ?? '-'}`);
  }
  {
    // E1 claim: prefer the token pulled from the real email; fall back to a
    // locally minted one when the Resend list API is unavailable.
    const token = e1TokenFromEmail ?? mintVerify(E1, true);
    const r = await call(jE1, 'POST', '/api/v2/reader/verify', { token });
    const claimed = c1 ? dbRow(c1.id) : null;
    const ok = r.status === 200 && r.json?.outcome === 'confirmed' && !!claimed?.reader_id;
    record('V6', `E1 verify (${e1TokenFromEmail ? 'token from real email' : 'minted token'}) -> claims C1`, ok, `outcome=${r.json?.outcome} c1.reader_id=${claimed?.reader_id ? 'set' : 'null'}`);
  }
  {
    const r = await call(jE2, 'GET', '/api/v2/reader/me');
    record('V7', 'reader/me with session -> reader identity', r.status === 200 && !!r.json?.reader, `reader=${r.json?.reader ? r.json.reader.provider : 'null'}`);
  }
  {
    // Resend endpoint: always {ok:true}, 5/min per IP -> 6th is 429. The
    // per-address send throttle (1/10min) silently suppresses actual mail.
    let sixth = 0;
    let shapeOk = true;
    for (let i = 0; i < 6; i++) {
      const r = await call(jMisc, 'POST', '/api/v2/reader/resend', { email: E1 });
      if (i < 5) shapeOk = shapeOk && r.status === 200 && r.json?.ok === true;
      else sixth = r.status;
    }
    record('V8', 'resend: 5x {ok:true}, 6th -> 429', shapeOk && sixth === 429, `shape=${shapeOk} sixth=${sixth}`);
  }

  // -- 6. create batch 2 (attempts 5-7) -------------------------------------
  console.log('\nwaiting 65s for the minute window...\n');
  await sleep(65_000);
  {
    const r = await call(jDisp, 'POST', '/api/v2/comments', createBody(jDisp, { email: DISPOSABLE, body: `C4 disposable retry ${RUN}` }));
    const row = r.json?.comment ? dbRow(r.json.comment.id) : null;
    record('C4', 'disposable email -> real held row', r.status === 201 && r.json?.outcome === 'held' && row?.status === 'held', `status=${r.status} db=${row?.status ?? 'missing'}`);
  }
  {
    const r = await call(jLink, 'POST', '/api/v2/comments', createBody(jLink, { email: E1, body: `C5 first link ${RUN} https://only.example` }));
    const row = r.json?.comment ? dbRow(r.json.comment.id) : null;
    record('C5', 'first-time session with one link -> held', r.status === 201 && r.json?.outcome === 'held' && row?.status === 'held', `status=${r.status} db=${row?.status ?? 'missing'}`);
  }
  let r1: any = null;
  if (c1) {
    const r = await call(jE2, 'POST', '/api/v2/comments', createBody(jE2, { email: E2, body: `R1 reply from verified reader ${RUN}`, parentId: c1.id }));
    r1 = r.json?.comment ?? null;
    const row = r1 ? dbRow(r1.id) : null;
    const ok = r.status === 201 && r.json?.outcome === benignOutcome && row?.parent_id === c1.id && !!row?.reader_id && r.json?.unverifiedEmail === false;
    record('R1', `verified reply -> ${benignOutcome}, parent + reader_id set, no verify nudge`, ok, `status=${r.status} outcome=${r.json?.outcome} parent=${row?.parent_id === c1.id} reader=${!!row?.reader_id} unverified=${r.json?.unverifiedEmail}`);
  } else {
    skip('R1', 'verified reply', 'C1 missing');
  }

  // -- 7. create batch 3 (attempts 8-9) -------------------------------------
  console.log('\nwaiting 65s for the minute window...\n');
  await sleep(65_000);
  {
    const r = await call(jE4, 'POST', '/api/v2/comments', createBody(jE4, { email: E4, body: `C7 shadow banned but perfectly nice ${RUN}` }));
    const row = r.json?.comment ? dbRow(r.json.comment.id) : null;
    record('C7', 'shadow-banned email -> held despite benign body', r.status === 201 && r.json?.outcome === 'held' && row?.status === 'held', `status=${r.status} db=${row?.status ?? 'missing'}`);
  }
  if (aiUp) {
    const r = await call(jE1, 'POST', '/api/v2/comments', createBody(jE1, { email: E1, body: `C8 you are all worthless idiots and I hope this site burns ${RUN}` }));
    const row = r.json?.comment ? dbRow(r.json.comment.id) : null;
    const ok = r.status === 201 && r.json?.outcome === 'held' && row != null && row.status !== 'published';
    record('C8', 'hostile body -> AI holds it', ok, `status=${r.status} outcome=${r.json?.outcome} db=${row?.status ?? 'missing'}`);
  } else {
    skip('C8', 'hostile body AI probe', 'AI key invalid; fail-closed already proven by C1=held');
  }

  // -- 8. edit / delete lifecycle on C1 + R1 + C3 ---------------------------
  if (c1) {
    {
      const r = await call(jE1, 'PATCH', `/api/v2/comments/${c1.id}`, { body: `C1 edited within window ${RUN}` });
      const row = dbRow(c1.id);
      record('E1', 'author edit within window -> 200, body updated', r.status === 200 && row?.body?.includes('edited within window'), `status=${r.status}`);
    }
    {
      const r = await call(jE2, 'PATCH', `/api/v2/comments/${c1.id}`, { body: 'foreign edit attempt' });
      record('E2', 'foreign edit -> 403 not_owner', r.status === 403 && r.json?.error === 'not_owner', `status=${r.status} error=${r.json?.error}`);
    }
    {
      const r = await call(jE1, 'PATCH', '/api/v2/comments/ffffffffffffffffffffffff', { body: 'ghost edit' });
      record('E3', 'edit unknown id -> 404', r.status === 404, `status=${r.status}`);
    }
    if (r1) {
      const r = await call(jE1, 'DELETE', `/api/v2/comments/${c1.id}`);
      const row = dbRow(c1.id);
      record('D1', 'delete root with reply -> tombstone', r.status === 200 && r.json?.tombstone === true && row?.status === 'deleted', `status=${r.status} tombstone=${r.json?.tombstone} db=${row?.status}`);
    } else {
      skip('D1', 'tombstone delete', 'R1 missing');
    }
    if (r1) {
      // Deletes are always soft (deleteOwnComment keeps the row with
      // status='deleted'); a reply-less leaf simply vanishes from the
      // public list instead of rendering a tombstone.
      const r = await call(jE2, 'DELETE', `/api/v2/comments/${r1.id}`);
      const row = dbRow(r1.id);
      const list = await call(jar('anon-d2'), 'GET', `/api/v2/comments?post=${POST_ID}`);
      const listed = ((list.json?.comments ?? []) as any[]).some((c) => c.id === r1.id);
      record('D2', 'delete leaf reply -> soft-deleted, hidden from list', r.status === 200 && r.json?.tombstone === false && row?.status === 'deleted' && !listed, `status=${r.status} tombstone=${r.json?.tombstone} db=${row?.status ?? 'gone'} listed=${listed}`);
    }
  } else {
    skip('E1', 'edit/delete lifecycle', 'C1 missing');
  }
  if (c3) {
    d1(`UPDATE blog_comments SET created_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-16 minutes') WHERE id = '${c3.id}'`);
    const r = await call(jE1, 'PATCH', `/api/v2/comments/${c3.id}`, { body: 'late edit attempt' });
    record('E4', 'edit after 15min window -> 409 edit_window_closed', r.status === 409 && r.json?.error === 'edit_window_closed', `status=${r.status} error=${r.json?.error}`);
  }

  // -- 9. list visibility ----------------------------------------------------
  {
    const r = await call(jar('anon-list'), 'GET', `/api/v2/comments?post=${POST_ID}`);
    const listed: any[] = r.json?.comments ?? [];
    const heldLeaked = listed.some((c) => c.status === 'held' || c.status === 'rejected');
    record('L1', 'public list shows no held/rejected', r.status === 200 && !heldLeaked, `status=${r.status} count=${listed.length} leaked=${heldLeaked}`);
  }

  // -- 10. turnstile reject path (runs LAST: each secret put rolls a new
  // worker version, and the minutes after a roll can flake DO calls and
  // in-flight requests -- keep that turbulence away from the create series) --
  {
    // Cloudflare's always-pass testing secret passes ANY token, so a garbage
    // token can't exercise the reject path. Swap in the documented
    // always-fail secret, probe, and swap back. The probe body also trips
    // the honeypot, which sits AFTER Turnstile: under the fail secret it
    // answers 400 turnstile_failed, under the pass secret 201 fake-held --
    // either way it consumes no rate limit and writes no row.
    const ALWAYS_FAIL = '2x0000000000000000000000000000000AA';
    const ALWAYS_PASS = '1x0000000000000000000000000000000AA';
    const pollBody = () => createBody(jMisc, { website: 'https://poll.example', body: `turnstile poll ${RUN} ${Date.now()}` });
    secretPut('TURNSTILE_SECRET_KEY', ALWAYS_FAIL);
    let rejected = false;
    for (let i = 0; i < 30 && !rejected; i++) {
      const r = await call(jMisc, 'POST', '/api/v2/comments', pollBody());
      if (r.status === 400 && r.json?.error === 'turnstile_failed') rejected = true;
      else await sleep(2000);
    }
    record('P2', 'failing turnstile verdict -> 400 turnstile_failed', rejected, rejected ? 'reject path live' : 'never rejected under always-fail secret');
    secretPut('TURNSTILE_SECRET_KEY', ALWAYS_PASS);
    let restored = false;
    for (let i = 0; i < 30 && !restored; i++) {
      const r = await call(jMisc, 'POST', '/api/v2/comments', pollBody());
      if (r.status === 201) restored = true;
      else await sleep(2000);
    }
    record('P2b', 'always-pass secret restored', restored, restored ? 'pass path live again' : 'STAGING STUCK ON FAIL SECRET');
  }

  // -- summary ---------------------------------------------------------------
  const fails = rows.filter((r) => r.outcome === 'FAIL');
  const skips = rows.filter((r) => r.outcome === 'SKIP');
  console.log(`\n===== ${rows.length} probes: ${rows.length - fails.length - skips.length} pass, ${fails.length} fail, ${skips.length} skip =====`);
  for (const f of fails) console.log(`  FAIL ${f.id} ${f.name} -- ${f.note}`);
  for (const s of skips) console.log(`  SKIP ${s.id} ${s.name} -- ${s.note}`);
  process.exit(fails.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('matrix aborted:', err);
  process.exit(2);
});
