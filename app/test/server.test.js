'use strict';
/*
 * Server tests. Run with `npm test` (or `node --test test/server.test.js`).
 *
 * - The server always runs as a child process (`node server/server.js`), the same way `npm start` runs it.
 * - Most tests use a REAL PostgreSQL: a throwaway cluster from test/support/pg-cluster.js (temp folder,
 *   free port, deleted afterwards). Without PostgreSQL installed those tests are skipped, with the reason;
 *   the file-store and rate-limit tests still run.
 * - One browser test drives the served page with Playwright (found via require() or the global npm
 *   folder). It is skipped if Playwright or its Chromium is not installed.
 */
const test = require('node:test');
const { before, after } = test;
const assert = require('node:assert/strict');
const { spawn, spawnSync, execFileSync } = require('child_process');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const D = require('../src/domain.js');
const { findPgBin, startCluster } = require('./support/pg-cluster.js');

const ROOT = path.join(__dirname, '..');
const SERVER = path.join(ROOT, 'server', 'server.js');
const PG_BIN = findPgBin();
const NO_PG = PG_BIN ? false : 'PostgreSQL not found (install it, or set PG_BIN to the folder holding initdb and postgres)';
const playwright = loadPlaywright();
const NO_BROWSER = NO_PG || (playwright ? false : 'Playwright not installed (npm i -g playwright, then npx playwright install chromium)');

const PINS = { VOLUNTEER_PIN: 'vol-4821', PARTNER_PIN: 'partner-7730', ADMIN_PIN: 'admin-9356' };
const SEED_ID = /^[a-z]+_s\d{1,4}$/; // ids from seedEvents (live ids are prefix_ + 6 random chars)
const T = { timeout: 60000 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------------- helpers ---------------- */

function loadPlaywright() {
  try { return require('playwright'); } catch (e) { /* try the global npm folder */ }
  try {
    const r = spawnSync('npm', ['root', '-g'], { encoding: 'utf8', shell: process.platform === 'win32' });
    if (r.status === 0) return require(path.join(r.stdout.trim(), 'playwright'));
  } catch (e) { /* not installed */ }
  return null;
}

const children = new Set();
process.on('exit', () => { for (const c of children) { try { c.kill('SIGKILL'); } catch (e) { /* gone */ } } });

// Start `node server/server.js` with exactly these env vars (plus PATH) on a free port.
function startServer(env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [SERVER], {
      cwd: ROOT,
      env: Object.assign({ PATH: process.env.PATH, PORT: '0' }, env),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    children.add(child);
    let out = '';
    let ready = false;
    const timer = setTimeout(() => {
      if (!ready) { child.kill('SIGKILL'); reject(new Error('server did not start:\n' + out)); }
    }, 30000);
    const onData = (d) => {
      out += d;
      const m = /listening on http:\/\/localhost:(\d+)/.exec(out);
      if (!m || ready) return;
      ready = true;
      clearTimeout(timer);
      resolve({
        base: 'http://127.0.0.1:' + m[1],
        output: () => out,
        stop: () => new Promise((res) => {
          if (child.exitCode !== null || child.signalCode !== null) return res(child.exitCode);
          child.once('exit', (code) => res(code));
          child.kill('SIGTERM');
        }),
      });
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('exit', (code) => {
      children.delete(child);
      if (!ready) { clearTimeout(timer); reject(new Error('server exited with code ' + code + ':\n' + out)); }
    });
  });
}

async function call(base, method, p, opts = {}) {
  const headers = Object.assign({}, opts.headers);
  let body = opts.body;
  if (body !== undefined && typeof body !== 'string') body = JSON.stringify(body);
  if (body !== undefined && !headers['content-type']) headers['content-type'] = 'application/json';
  if (opts.pin) headers['x-foodlink-pin'] = opts.pin;
  const r = await fetch(base + p, { method, headers, body });
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch (e) { /* not JSON */ }
  return { status: r.status, headers: r.headers, text, json };
}
const act = (base, action, input, opts = {}) => call(base, 'POST', '/api/actions', Object.assign({ body: { action, input } }, opts));
const getState = async (base) => (await call(base, 'GET', '/api/state')).json;
const foldedState = async (base) => { const s = await getState(base); return D.fold(s.events, s.pilotStart); };
const health = async (base) => (await call(base, 'GET', '/api/health')).json;

async function waitUntil(fn, ms, label) {
  const end = Date.now() + (ms || 5000);
  for (;;) {
    if (await fn()) return;
    if (Date.now() > end) throw new Error('timed out waiting for ' + (label || 'condition'));
    await sleep(50);
  }
}

async function sql(url, text, params) {
  const { Client } = require('pg');
  const c = new Client({ connectionString: url });
  await c.connect();
  try { return (await c.query(text, params)).rows; } finally { await c.end(); }
}

function restockInput(state, pointId, changes) {
  const counts = {};
  for (const c of D.CATEGORIES) {
    counts[c.id] = Object.assign({ before: state.points[pointId].stock[c.id], added: 0, removed: 0 }, (changes || {})[c.id]);
  }
  return { pointId, counts, checklist: { sealed: true, dated: true, shelfStable: true } };
}

const DROP = { partner: 'Test café', title: 'Wrapped sandwiches', kind: 'prepared', qty: 3, place: 'UCC, room 40F', windowMin: 60, sealed: true, labelled: true };

// Minimal SSE client: collects messages ({event, data, id, comment, retry}) from GET /api/stream.
function openStream(base, opts = {}) {
  const messages = [];
  const waiters = new Set();
  let buf = '';
  let closed = false;
  let req;
  const u = new URL(base + '/api/stream' + (opts.query || ''));
  const headers = { accept: 'text/event-stream' };
  if (opts.lastEventId) headers['last-event-id'] = opts.lastEventId;
  const ready = new Promise((resolve, reject) => {
    req = http.get({ hostname: u.hostname, port: u.port, path: u.pathname + u.search, headers }, (res) => {
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        buf += chunk;
        let i;
        while ((i = buf.indexOf('\n\n')) >= 0) {
          messages.push(parseSse(buf.slice(0, i)));
          buf = buf.slice(i + 2);
        }
        for (const w of waiters) w();
      });
      resolve(res);
    });
    req.on('error', (e) => { if (!closed) reject(e); });
  });
  ready.catch(() => {});
  return {
    messages,
    ready,
    waitFor(pred, ms) {
      return new Promise((resolve, reject) => {
        const check = () => {
          const m = messages.find(pred);
          if (!m) return false;
          clearTimeout(t);
          waiters.delete(check);
          resolve(m);
          return true;
        };
        const t = setTimeout(() => {
          waiters.delete(check);
          reject(new Error('no matching SSE message; got ' + JSON.stringify(messages).slice(0, 400)));
        }, ms || 5000);
        if (!check()) waiters.add(check);
      });
    },
    close() { closed = true; req.destroy(); },
  };
}

function parseSse(block) {
  const msg = { event: null, data: null, id: null, comment: null, retry: null };
  for (const line of block.split('\n')) {
    if (line.startsWith(':')) { msg.comment = line.slice(1).trim(); continue; }
    const i = line.indexOf(':');
    const field = i < 0 ? line : line.slice(0, i);
    let value = i < 0 ? '' : line.slice(i + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'event') msg.event = value;
    else if (field === 'data') msg.data = msg.data === null ? value : msg.data + '\n' + value;
    else if (field === 'id') msg.id = value;
    else if (field === 'retry') msg.retry = Number(value);
  }
  return msg;
}

/* ---------------- fixtures ---------------- */

let cluster = null;
let DB_URL = null;
let srv = null; // the Postgres-backed server most tests talk to (PINs set)
const pgEnv = () => Object.assign({
  DATABASE_URL: DB_URL,
  RATE_LIMIT_PER_MIN: '1000', // limits are tested on their own server below
  AUTH_FAIL_LIMIT_PER_MIN: '1000',
  SSE_HEARTBEAT_MS: '200',
}, PINS);

before(async () => {
  execFileSync(process.execPath, [path.join(ROOT, 'build.js')], { cwd: ROOT, stdio: 'ignore' }); // writes server/public/index.html
  if (NO_PG) return;
  cluster = await startCluster(PG_BIN);
  DB_URL = await cluster.createDatabase('foodlink_test');
  srv = await startServer(pgEnv());
});

after(async () => {
  if (srv) await srv.stop();
  if (cluster) await cluster.stop();
});

/* ---------------- Postgres-backed server ---------------- */

test('postgres: migrates, seeds once and serves the whole log at GET /api/state', Object.assign({ skip: NO_PG }, T), async () => {
  const h = await health(srv.base);
  assert.equal(h.ok, true);
  assert.equal(h.store, 'postgres');
  const r = await call(srv.base, 'GET', '/api/state');
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /^application\/json/);
  assert.deepEqual(Object.keys(r.json).sort(), ['events', 'pilotStart']);
  const { pilotStart, events } = r.json;
  assert.equal(typeof pilotStart, 'number');
  assert.ok(events.length > 300, 'simulated pilot loaded');
  const ids = new Set();
  events.forEach((e, i) => {
    assert.ok(typeof e.id === 'string' && typeof e.type === 'string' && Number.isInteger(e.at), JSON.stringify(e));
    if (i) assert.ok(e.at >= events[i - 1].at, 'sorted by at');
    ids.add(e.id);
  });
  assert.equal(ids.size, events.length, 'ids are unique');
  assert.deepEqual(Object.keys(D.fold(events, pilotStart).points).sort(), ['ucc', 'weldon']);

  assert.deepEqual((await sql(DB_URL, 'SELECT name FROM schema_migrations ORDER BY name')).map((x) => x.name), ['001_init.sql']);
  assert.equal((await sql(DB_URL, 'SELECT count(*)::int AS n FROM events'))[0].n, events.length);
  assert.equal(Number((await sql(DB_URL, "SELECT value FROM meta WHERE key = 'pilotStart'"))[0].value), pilotStart);
  const idx = (await sql(DB_URL, "SELECT indexname FROM pg_indexes WHERE tablename = 'events'")).map((x) => x.indexname);
  assert.ok(idx.includes('events_at_idx'), idx.join(','));
  assert.match(srv.output(), /applied 001_init\.sql/);
  assert.match(srv.output(), /seeded the simulated pilot/);
});

test('page, domain module and security headers', Object.assign({ skip: NO_PG }, T), async () => {
  const page = await call(srv.base, 'GET', '/');
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-type'), /^text\/html/);
  assert.match(page.text, /window\.FOODLINK_API = '\/api'/);
  assert.match(page.text, /<script src="\/domain\.js"><\/script>/);
  const csp = page.headers.get('content-security-policy');
  const scriptSrc = csp.split(';').map((s) => s.trim()).find((s) => s.startsWith('script-src'));
  assert.doesNotMatch(scriptSrc, /unsafe-inline|unsafe-eval/);
  const inline = [...page.text.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => crypto.createHash('sha256').update(m[1]).digest('base64'));
  assert.equal(inline.length, 2, 'two inline scripts: API base and the UI');
  for (const h of inline) assert.ok(scriptSrc.includes("'sha256-" + h + "'"), 'inline script allowed by hash');
  assert.match(csp, /default-src 'self'/);
  assert.match(csp, /style-src [^;]*https:\/\/fonts\.googleapis\.com/);
  assert.match(csp, /font-src [^;]*https:\/\/fonts\.gstatic\.com/);
  assert.match(csp, /frame-ancestors 'none'/);
  for (const r of [page, await call(srv.base, 'GET', '/api/state'), await call(srv.base, 'GET', '/api/nope')]) {
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(r.headers.get('referrer-policy'), 'no-referrer');
  }
  const dom = await call(srv.base, 'GET', '/domain.js');
  assert.equal(dom.status, 200);
  assert.match(dom.headers.get('content-type'), /^application\/javascript/);
  assert.equal(dom.text, fs.readFileSync(path.join(ROOT, 'src', 'domain.js'), 'utf8'));
  assert.equal((await call(srv.base, 'GET', '/nope')).status, 404);
  const api404 = await call(srv.base, 'GET', '/api/nope');
  assert.equal(api404.status, 404);
  assert.equal(api404.json.ok, false);
  const wrong = await call(srv.base, 'GET', '/api/actions');
  assert.equal(wrong.status, 405);
  assert.equal(wrong.headers.get('allow'), 'POST');
});

test('restock: volunteer PIN required, domain rules enforced, saved to Postgres', Object.assign({ skip: NO_PG }, T), async () => {
  const st = await foldedState(srv.base);
  const good = restockInput(st, 'weldon', { snacks: { added: 3 }, grains: { before: st.points.weldon.stock.grains + 1 } });
  let r = await act(srv.base, 'restock', good);
  assert.equal(r.status, 401, 'missing PIN');
  assert.equal(r.json.ok, false);
  assert.match(r.json.errors[0], /volunteer PIN/);
  r = await act(srv.base, 'restock', good, { pin: 'not-the-pin' });
  assert.equal(r.status, 401, 'wrong PIN');
  assert.match(r.json.errors[0], /not right/);
  r = await act(srv.base, 'restock', good, { pin: PINS.PARTNER_PIN });
  assert.equal(r.status, 401, 'a partner PIN does not open volunteer actions');

  r = await act(srv.base, 'restock', Object.assign({}, good, { checklist: {} }), { pin: PINS.VOLUNTEER_PIN });
  assert.equal(r.status, 400);
  assert.equal(r.json.ok, false);
  assert.ok(r.json.errors.some((e) => /sealed/.test(e)), r.json.errors.join(' | '));
  const bad = restockInput(st, 'weldon', { snacks: { before: 2, removed: 3 } });
  assert.equal((await act(srv.base, 'restock', bad, { pin: PINS.VOLUNTEER_PIN })).status, 400, 'cannot remove more than was there');
  for (const pointId of ['mars', '__proto__', 'constructor']) {
    r = await act(srv.base, 'restock', Object.assign({}, good, { pointId }), { pin: PINS.VOLUNTEER_PIN });
    assert.equal(r.status, 400, pointId);
  }

  const t0 = Date.now();
  r = await act(srv.base, 'restock', good, { pin: PINS.VOLUNTEER_PIN });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json.ok, true);
  assert.equal(r.json.event.type, 'restock');
  assert.equal(r.json.event.pointId, 'weldon');
  assert.equal(r.json.event.counts.snacks.added, 3);
  assert.ok(r.json.event.at >= t0 - 1000 && r.json.event.at <= Date.now() + 1000, 'stamped with server time');
  assert.ok(r.json.warnings.some((w) => /Was stock added/.test(w)), 'domain warnings are passed on');
  const rows = await sql(DB_URL, 'SELECT type, at, payload FROM events WHERE id = $1', [r.json.event.id]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].type, 'restock');
  assert.equal(Number(rows[0].at), r.json.event.at);
  assert.deepEqual(rows[0].payload, r.json.event);
});

test('report: public, validated, unknown shelves rejected', Object.assign({ skip: NO_PG }, T), async () => {
  const r = await act(srv.base, 'report', { pointId: 'ucc', cat: 'snacks' });
  assert.equal(r.status, 200);
  assert.equal(r.json.event.type, 'report');
  assert.equal(r.json.event.pointId, 'ucc');
  assert.equal(r.json.event.cat, 'snacks');
  for (const bad of [{ pointId: 'ucc', cat: 'caviar' }, { pointId: 'mars', cat: 'snacks' }, { pointId: '__proto__', cat: '__proto__' }, { pointId: 'ucc', cat: 'constructor' }, { pointId: 1, cat: 2 }]) {
    const x = await act(srv.base, 'report', bad);
    assert.equal(x.status, 400, JSON.stringify(bad));
    assert.deepEqual(x.json, { ok: false, errors: ['Unknown shelf.'] });
  }
  assert.equal((await sql(DB_URL, 'SELECT count(*)::int AS n FROM events WHERE id = $1', [r.json.event.id]))[0].n, 1);
});

test('drop, reserve, pickup: partner PIN where needed, food-safety and code rules enforced', Object.assign({ skip: NO_PG }, T), async () => {
  const P = { pin: PINS.PARTNER_PIN };
  let r = await act(srv.base, 'drop', DROP);
  assert.equal(r.status, 401);
  assert.match(r.json.errors[0], /partner PIN/);
  assert.equal((await act(srv.base, 'drop', DROP, { pin: PINS.VOLUNTEER_PIN })).status, 401, 'volunteer PIN is not a partner PIN');
  r = await act(srv.base, 'drop', Object.assign({}, DROP, { sealed: false }), P);
  assert.equal(r.status, 400);
  assert.ok(r.json.errors.some((e) => /sealed/i.test(e)));
  assert.equal((await act(srv.base, 'drop', Object.assign({}, DROP, { windowMin: 240 }), P)).status, 400, 'prepared food: 2 h at most');
  assert.equal((await act(srv.base, 'drop', Object.assign({}, DROP, { kind: '__proto__' }), P)).status, 400);
  assert.equal((await act(srv.base, 'drop', Object.assign({}, DROP, { partner: '__proto__' }), P)).status, 400);
  r = await act(srv.base, 'drop', DROP, P);
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json.event.type, 'drop_post');
  const dropId = r.json.event.drop.id;

  for (const id of ['d_nope', '__proto__', 'constructor', 42]) {
    const x = await act(srv.base, 'reserve', { dropId: id });
    assert.equal(x.status, 400, String(id));
  }
  r = await act(srv.base, 'reserve', { dropId });
  assert.equal(r.status, 200, 'reserving is public');
  const code = r.json.event.code;
  assert.match(code, /^FL-\d{4}$/);

  assert.equal((await act(srv.base, 'pickup', { code })).status, 401);
  r = await act(srv.base, 'pickup', { code: 'FL-12' }, P);
  assert.equal(r.status, 400);
  assert.deepEqual(r.json.errors, ['Codes look like FL-1234.']);
  assert.deepEqual((await act(srv.base, 'pickup', { code: 'FL-0000' }, P)).json.errors, ['No reservation with that code.']);
  r = await act(srv.base, 'pickup', { code: code.toLowerCase() }, P);
  assert.equal(r.status, 200);
  assert.equal(r.json.event.code, code);
  r = await act(srv.base, 'pickup', { code }, P);
  assert.equal(r.status, 400);
  assert.deepEqual(r.json.errors, ['Already picked up.']);

  assert.equal((await act(srv.base, 'reserve', { dropId })).status, 200);
  assert.equal((await act(srv.base, 'reserve', { dropId })).status, 200);
  r = await act(srv.base, 'reserve', { dropId });
  assert.equal(r.status, 400);
  assert.deepEqual(r.json.errors, ['All claimed.']);
  const st = await foldedState(srv.base);
  assert.equal(st.drops[dropId].remaining, 0);
  assert.equal(st.drops[dropId].picked, 1);
});

test('concurrent requests are handled one at a time: no overbooking, log stays in order', Object.assign({ skip: NO_PG }, T), async () => {
  const drop = (await act(srv.base, 'drop', Object.assign({}, DROP, { qty: 4 }), { pin: PINS.PARTNER_PIN })).json.event;
  const results = await Promise.all(Array.from({ length: 12 }, () => act(srv.base, 'reserve', { dropId: drop.drop.id })));
  const won = results.filter((r) => r.status === 200);
  assert.equal(won.length, 4, 'exactly as many reservations as items');
  assert.ok(results.filter((r) => r.status === 400).every((r) => r.json.errors[0] === 'All claimed.'));
  assert.equal(new Set(won.map((r) => r.json.event.code)).size, 4, 'codes are unique');
  await Promise.all(Array.from({ length: 15 }, (_, i) => act(srv.base, 'report', { pointId: i % 2 ? 'ucc' : 'weldon', cat: 'snacks' })));
  const { events } = await getState(srv.base);
  for (let i = 1; i < events.length; i++) assert.ok(events[i].at >= events[i - 1].at, 'still sorted by at');
  const db = (await sql(DB_URL, 'SELECT id FROM events ORDER BY seq')).map((r) => r.id);
  assert.deepEqual(db, events.map((e) => e.id), 'Postgres order matches the served order');
});

test('requests: unknown action, bad JSON, wrong content type, 32 KB body limit', Object.assign({ skip: NO_PG }, T), async () => {
  const post = (body, headers) => call(srv.base, 'POST', '/api/actions', { body, headers });
  assert.deepEqual((await post({ action: 'teleport', input: {} })).json, { ok: false, errors: ['Unknown action.'] });
  assert.equal((await post({ action: 'toString', input: {} })).status, 400);
  let r = await post('{"action":');
  assert.equal(r.status, 400);
  assert.match(r.json.errors[0], /valid JSON/);
  assert.equal((await post('[1,2]')).status, 400);
  assert.deepEqual((await post({ action: 'report' })).json, { ok: false, errors: ['Missing input.'] });
  r = await post(JSON.stringify({ action: 'report', input: { pointId: 'ucc', cat: 'snacks' } }), { 'content-type': 'text/plain' });
  assert.equal(r.status, 415);
  const pad = (n) => ({ action: 'report', input: { pointId: 'ucc', cat: 'snacks', pad: 'x'.repeat(n) } });
  r = await post(pad(33 * 1024));
  assert.equal(r.status, 413);
  assert.match(r.json.errors[0], /32 KB/);
  assert.equal((await post(pad(31 * 1024))).status, 200, 'just under the limit is fine');
});

test('SSE: new events reach subscribers live, with heartbeats and catch-up after Last-Event-ID', Object.assign({ skip: NO_PG }, T), async () => {
  const snap = await getState(srv.base);
  const lastId = snap.events[snap.events.length - 1].id;
  const s1 = openStream(srv.base);
  const res = await s1.ready;
  assert.equal(res.statusCode, 200);
  assert.match(res.headers['content-type'], /^text\/event-stream/);
  assert.equal(res.headers['cache-control'], 'no-store, no-transform');
  const where = await s1.waitFor((m) => m.id && !m.event); // "you are here": <log token>.<last event id>
  const token = where.id.split('.')[0];
  assert.equal(where.id, token + '.' + lastId);
  await s1.waitFor((m) => m.comment === 'heartbeat', 3000);

  const posted = (await act(srv.base, 'report', { pointId: 'weldon', cat: 'grains' })).json.event;
  const got = await s1.waitFor((m) => m.event === 'ev');
  assert.equal(got.id, token + '.' + posted.id);
  assert.deepEqual(JSON.parse(got.data), posted);

  const s2 = openStream(srv.base, { query: '?lastEventId=' + encodeURIComponent(lastId) }); // page with an older snapshot
  assert.equal((await s2.waitFor((m) => m.event === 'ev')).id, token + '.' + posted.id, 'caught up');
  const s3 = openStream(srv.base, { query: '?lastEventId=' + encodeURIComponent(posted.id) }); // already has it
  await s3.waitFor((m) => m.id === token + '.' + posted.id && !m.event);
  const posted2 = (await act(srv.base, 'report', { pointId: 'weldon', cat: 'sauces' })).json.event;
  assert.equal((await s3.waitFor((m) => m.event === 'ev')).id, token + '.' + posted2.id, 'nothing old replayed');
  const s4 = openStream(srv.base, { lastEventId: token + '.' + lastId }); // browser reconnect after missing two
  await s4.waitFor((m) => m.event === 'ev' && m.id === token + '.' + posted2.id);
  assert.deepEqual(s4.messages.filter((m) => m.event === 'ev').map((m) => JSON.parse(m.data).id), [posted.id, posted2.id]);
  const s5 = openStream(srv.base, { lastEventId: 'rp_gone00' }); // unknown event
  await s5.waitFor((m) => m.event === 'reset');
  const s6 = openStream(srv.base, { lastEventId: 'a1b2c3d4e5f6.' + lastId }); // known id, but from another log
  await s6.waitFor((m) => m.event === 'reset');
  assert.equal(s6.messages.filter((m) => m.event === 'ev').length, 0);

  assert.equal((await health(srv.base)).streams, 6);
  [s1, s2, s3, s4, s5, s6].forEach((s) => s.close());
  await waitUntil(async () => (await health(srv.base)).streams === 0, 5000, 'streams to close');
});

test('Postgres keeps the event log append-only', Object.assign({ skip: NO_PG }, T), async () => {
  const [row] = await sql(DB_URL, 'SELECT id FROM events ORDER BY seq DESC LIMIT 1');
  await assert.rejects(sql(DB_URL, "UPDATE events SET type = 'report' WHERE id = $1", [row.id]), /append-only/);
  await assert.rejects(sql(DB_URL, 'DELETE FROM events WHERE id = $1', [row.id]), /append-only/);
  await assert.rejects(sql(DB_URL, "INSERT INTO events (id, type, at, payload) VALUES ('x_1', 'teleport', 1, '{}')"), /check constraint/);
});

test('reset: admin PIN required, reseeds the log in Postgres and emits reset', Object.assign({ skip: NO_PG }, T), async () => {
  assert.ok((await getState(srv.base)).events.some((e) => !SEED_ID.test(e.id)), 'there are live events to wipe');
  assert.equal((await call(srv.base, 'POST', '/api/reset')).status, 401);
  assert.equal((await call(srv.base, 'POST', '/api/reset', { pin: PINS.VOLUNTEER_PIN })).status, 401);
  const s = openStream(srv.base);
  await s.ready;
  const r = await call(srv.base, 'POST', '/api/reset', { pin: PINS.ADMIN_PIN });
  assert.equal(r.status, 200);
  assert.equal(r.json.ok, true);
  const msg = await s.waitFor((m) => m.event === 'reset');
  assert.equal(typeof JSON.parse(msg.data).pilotStart, 'number');
  s.close();
  const fresh = await getState(srv.base);
  assert.ok(fresh.events.length > 300);
  assert.ok(fresh.events.every((e) => SEED_ID.test(e.id)), 'only the simulated pilot is left');
  assert.equal((await sql(DB_URL, 'SELECT count(*)::int AS n FROM events'))[0].n, fresh.events.length);
  assert.equal(Number((await sql(DB_URL, "SELECT value FROM meta WHERE key = 'pilotStart'"))[0].value), fresh.pilotStart);
  assert.equal((await act(srv.base, 'report', { pointId: 'ucc', cat: 'breakfast' })).status, 200, 'works as normal afterwards');
});

test('persistence: events survive a server restart (Postgres)', Object.assign({ skip: NO_PG }, T), async () => {
  const posted = (await act(srv.base, 'report', { pointId: 'weldon', cat: 'protein' })).json.event;
  const snap = await getState(srv.base);
  const s = openStream(srv.base);
  const where = (await s.waitFor((m) => m.id && !m.event)).id;
  s.close();
  assert.equal(await srv.stop(), 0, 'clean shutdown on SIGTERM');
  srv = await startServer(pgEnv());
  const again = await getState(srv.base);
  assert.deepEqual(again, snap, 'same pilot, same events, same order');
  assert.ok(again.events.some((e) => e.id === posted.id));
  assert.doesNotMatch(srv.output(), /seeded|applied/, 'no reseed, no re-migration');
  assert.equal((await sql(DB_URL, 'SELECT count(*)::int AS n FROM schema_migrations'))[0].n, 1);
  const back = openStream(srv.base, { lastEventId: where }); // a page reconnecting after the restart
  await back.waitFor((m) => m.event === 'reset'); // reloads once, to be safe
  back.close();
});

test('browser, API mode: a report on one page shows up live on another and is a row in Postgres', Object.assign({ skip: NO_BROWSER }, T, { timeout: 120000 }), async (t) => {
  let browser;
  try {
    browser = await playwright.chromium.launch();
  } catch (err) {
    t.skip('Chromium for Playwright is not installed: ' + String(err.message).split('\n')[0]);
    return;
  }
  const open = async (hash) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, timezoneId: 'America/Toronto' });
    await ctx.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
    await ctx.route('https://fonts.gstatic.com/**', (r) => r.abort());
    const page = await ctx.newPage();
    const problems = [];
    page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
    // 401s are expected below (PIN prompts); anything else, including CSP violations, is a failure.
    page.on('console', (m) => { if (m.type() === 'error' && !/status of 401/.test(m.text())) problems.push('console: ' + m.text()); });
    await page.goto(srv.base + '/' + hash);
    return { ctx, page, problems };
  };
  try {
    const base0 = (await health(srv.base)).streams;
    const a = await open('#find'); // the student's phone
    const b = await open('#impact'); // the USC dashboard on another device
    await a.page.waitForSelector('[data-testid="point-weldon"]');
    await b.page.waitForSelector('[data-testid="feed"]');
    await waitUntil(async () => (await health(srv.base)).streams === base0 + 2, 5000, 'one stream per page');

    await a.page.click('[data-testid="point-weldon"] [data-act="report-open"]');
    await a.page.click('[data-testid="point-weldon"] [data-act="report"][data-cat="hygiene"]');
    await a.page.waitForFunction(() => /Reported empty/.test(document.querySelector('[data-testid="cat-weldon-hygiene"]').innerText));
    await b.page.waitForFunction(() => {
      const live = window.__foodlink.Store.live;
      return live.length === 1 && live[0].type === 'report';
    }, null, { timeout: 5000 });
    const ev = await b.page.evaluate(() => window.__foodlink.Store.live[0]);
    assert.equal(ev.pointId, 'weldon');
    assert.equal(ev.cat, 'hygiene');
    await b.page.waitForFunction(() => /Period & hygiene reported empty at Weldon Point/.test(document.querySelector('[data-testid="feed"]').innerText));
    const rows = await sql(DB_URL, 'SELECT type, payload FROM events WHERE id = $1', [ev.id]);
    assert.equal(rows.length, 1, 'the report is a row in Postgres');
    assert.equal(rows[0].type, 'report');
    assert.deepEqual(rows[0].payload, ev);

    // Volunteer restock: the server asks for the PIN, the page shows the field, then it saves.
    await a.page.click('a[href="#restock"]');
    await a.page.waitForSelector('[data-testid="rs-submit"]');
    for (const k of ['sealed', 'dated', 'shelfStable']) await a.page.check('input[data-check="' + k + '"]');
    await a.page.click('[data-testid="rs-submit"]');
    await a.page.waitForSelector('input[data-key="pin-rs"]');
    assert.match(await a.page.locator('.msg.bad[role="alert"]').innerText(), /volunteer PIN/);
    await a.page.fill('input[data-key="pin-rs"]', PINS.VOLUNTEER_PIN);
    await a.page.click('[data-testid="rs-submit"]');
    await a.page.waitForSelector('.msg.good[role="status"]');
    await b.page.waitForFunction(() => window.__foodlink.Store.live.some((e) => e.type === 'restock'));

    // Reset from the presenter view: prompts for the admin PIN; the other page reloads; no streams leak.
    a.page.once('dialog', (d) => d.accept(PINS.ADMIN_PIN));
    await a.page.click('a[href="#present"]');
    await a.page.waitForSelector('[data-testid="reset"]');
    await a.page.click('[data-testid="reset"]');
    await a.page.waitForFunction(() => /Demo reset/.test(document.getElementById('toast').innerText));
    await b.page.waitForFunction((src) => {
      const S = window.__foodlink.Store;
      const re = new RegExp(src);
      return S.live.length === 0 && S.seed.length > 300 && S.seed.every((e) => re.test(e.id));
    }, SEED_ID.source, { timeout: 5000 });
    await waitUntil(async () => (await health(srv.base)).streams === base0 + 2, 5000, 'one stream per page after reset');
    await sleep(500);
    assert.equal((await health(srv.base)).streams, base0 + 2, 'no extra streams opened by the reset');
    assert.equal((await sql(DB_URL, 'SELECT count(*)::int AS n FROM events WHERE id = $1', [ev.id]))[0].n, 0, 'Postgres was reset too');

    assert.deepEqual(a.problems, []);
    assert.deepEqual(b.problems, []);
    await a.ctx.close();
    await b.ctx.close();
  } finally {
    await browser.close();
  }
});

test('database outage: actions fail with 500 and nothing is applied or broadcast', Object.assign({ skip: NO_PG }, T), async () => {
  const url = await cluster.createDatabase('foodlink_outage');
  const s = await startServer(Object.assign({}, pgEnv(), { DATABASE_URL: url }));
  try {
    const snap = await getState(s.base);
    const sse = openStream(s.base);
    await sse.ready;
    await sql(DB_URL, 'DROP DATABASE foodlink_outage WITH (FORCE)'); // the database disappears under the server
    const r = await act(s.base, 'report', { pointId: 'ucc', cat: 'snacks' });
    assert.equal(r.status, 500);
    assert.equal(r.json.ok, false);
    assert.equal((await call(s.base, 'GET', '/api/health')).status, 503);
    await sleep(300);
    assert.equal(sse.messages.filter((m) => m.event === 'ev').length, 0, 'nothing broadcast');
    assert.deepEqual(await getState(s.base), snap, 'nothing applied');
    sse.close();
  } finally {
    await s.stop();
  }
});

/* ---------------- no database needed ---------------- */

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'foodlink-test-'));
}

test('rate limits: public actions per device, wrong-PIN lockout, X-Forwarded-For only with TRUST_PROXY', T, async () => {
  const dir = tmpDir();
  const s = await startServer(Object.assign({
    DATA_FILE: path.join(dir, 'events.json'), RATE_LIMIT_PER_MIN: '3', AUTH_FAIL_LIMIT_PER_MIN: '2', TRUST_PROXY: '1',
  }, PINS));
  try {
    const from = (ip, extra) => Object.assign({ headers: { 'x-forwarded-for': ip } }, extra);
    const shelf = { pointId: 'ucc', cat: 'snacks' };
    for (let i = 0; i < 3; i++) assert.equal((await act(s.base, 'report', shelf, from('203.0.113.7'))).status, 200);
    let r = await act(s.base, 'report', shelf, from('203.0.113.7'));
    assert.equal(r.status, 429);
    assert.equal(r.json.ok, false);
    assert.match(r.json.errors[0], /Too many/);
    assert.ok(Number(r.headers.get('retry-after')) > 0, 'Retry-After header');
    assert.equal((await act(s.base, 'reserve', { dropId: 'd_nope' }, from('203.0.113.7'))).status, 429, 'reports and reservations share the limit');
    assert.equal((await act(s.base, 'report', shelf, from('10.9.9.9, 203.0.113.7'))).status, 429, 'a forged left-hand address does not help');
    assert.equal((await act(s.base, 'report', shelf, from('203.0.113.8'))).status, 200, 'another device has its own allowance');

    const st = await foldedState(s.base);
    const rs = restockInput(st, 'ucc');
    assert.equal((await act(s.base, 'restock', rs, from('203.0.113.7', { pin: PINS.VOLUNTEER_PIN }))).status, 200, 'PIN actions are not counted as public ones');

    const dev = '198.51.100.4';
    assert.equal((await act(s.base, 'restock', rs, from(dev, { pin: 'guess-1' }))).status, 401);
    assert.equal((await act(s.base, 'restock', rs, from(dev, { pin: 'guess-2' }))).status, 401);
    r = await act(s.base, 'restock', rs, from(dev, { pin: PINS.VOLUNTEER_PIN }));
    assert.equal(r.status, 429, 'locked out after 2 wrong PINs, even with the right one');
    assert.match(r.json.errors[0], /wrong PINs/);
    assert.equal((await call(s.base, 'POST', '/api/reset', from(dev, { pin: PINS.ADMIN_PIN }))).status, 429);
    assert.equal((await act(s.base, 'restock', rs, from('198.51.100.5', { pin: PINS.VOLUNTEER_PIN }))).status, 200, 'other devices unaffected');
  } finally {
    await s.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('file store: works without DATABASE_URL, warns that PIN gates are open, survives a restart', T, async () => {
  const dir = tmpDir();
  const file = path.join(dir, 'data', 'events.json');
  const env = { DATA_FILE: file, RATE_LIMIT_PER_MIN: '1' };
  let s = await startServer(env);
  try {
    const out = s.output();
    assert.match(out, /store: +JSON file .*events\.json/);
    for (const name of ['VOLUNTEER_PIN', 'PARTNER_PIN', 'ADMIN_PIN']) assert.match(out, new RegExp('WARNING: ' + name + ' is not set'));
    assert.equal((await health(s.base)).store, 'file');
    const st0 = await getState(s.base);
    assert.equal(typeof st0.pilotStart, 'number');
    assert.ok(st0.events.length > 300);
    assert.ok(st0.events.every((e) => SEED_ID.test(e.id)));

    let r = await act(s.base, 'restock', restockInput(D.fold(st0.events, st0.pilotStart), 'ucc', { protein: { added: 5 } }));
    assert.equal(r.status, 200, 'no VOLUNTEER_PIN set: restock is open');
    const restockId = r.json.event.id;
    r = await act(s.base, 'drop', DROP);
    assert.equal(r.status, 200, 'no PARTNER_PIN set: drops are open');
    const dropId = r.json.event.id;
    r = await act(s.base, 'report', { pointId: 'weldon', cat: 'hygiene' });
    assert.equal(r.status, 200);
    const reportId = r.json.event.id;
    const onDisk = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.deepEqual(onDisk.events.slice(-3).map((e) => e.id), [restockId, dropId, reportId]);
    r = await act(s.base, 'report', { pointId: 'weldon', cat: 'hygiene' }, { headers: { 'x-forwarded-for': '192.0.2.99' } });
    assert.equal(r.status, 429, 'without TRUST_PROXY a forged X-Forwarded-For is ignored');

    const snap = await getState(s.base);
    assert.equal(await s.stop(), 0);
    s = await startServer(env);
    assert.deepEqual(await getState(s.base), snap, 'same log after restart');
    assert.doesNotMatch(s.output(), /seeded/);

    const sse = openStream(s.base);
    await sse.ready;
    assert.equal((await call(s.base, 'POST', '/api/reset')).status, 200, 'no ADMIN_PIN set: reset is open');
    await sse.waitFor((m) => m.event === 'reset');
    sse.close();
    const reseeded = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.ok(reseeded.events.length > 300 && reseeded.events.every((e) => SEED_ID.test(e.id)));
  } finally {
    await s.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
