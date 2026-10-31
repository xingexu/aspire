#!/usr/bin/env node
'use strict';
/*
 * FoodLink server. node:http + pg, no framework.
 *
 *   GET  /              the app (server/public/index.html, written by build.js)
 *   GET  /domain.js     the shared domain module, the same file the browser and the server run
 *   GET  /api/state     {pilotStart, events}: the whole event log in order
 *   GET  /api/stream    Server-Sent Events: `ev` for each new event, `reset` after a reset
 *   POST /api/actions   {action, input}: restock | report | drop | reserve | pickup
 *   POST /api/reset     wipe the log and reseed the simulated pilot (admin)
 *   GET  /api/health    liveness + database check
 *
 * State is never stored directly. The server keeps the event log, folds it into memory with the domain
 * module, and appends new events to PostgreSQL (or a JSON file) before applying and broadcasting them.
 */

// The simulated pilot is seeded in campus time (Western is in London, Ontario). Hosts usually run in UTC.
if (!process.env.TZ) process.env.TZ = 'America/Toronto';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const D = require('../src/domain.js');
const { createStore } = require('./store.js');

const PAGE_FILE = path.join(__dirname, 'public', 'index.html');
const DOMAIN_FILE = path.join(__dirname, '..', 'src', 'domain.js');
const BODY_LIMIT = 32 * 1024; // largest JSON body we accept
const DRAIN_LIMIT = 1024 * 1024; // bigger than this and we drop the connection instead of reading on
const MAX_STREAMS = 1000; // open SSE connections
const MAX_STREAM_BUFFER = 1024 * 1024; // a client this far behind is disconnected (it reconnects and catches up)
const MAX_CODES = 9000; // FL-1000..FL-9999

// Who may do what. A role whose PIN is not set is open to everyone (demo mode).
const ACTIONS = {
  restock: { role: 'volunteer' },
  report: { role: null, limited: true },
  drop: { role: 'partner' },
  reserve: { role: null, limited: true },
  pickup: { role: 'partner' },
};

const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const isKey = (v, table) => typeof v === 'string' && hasOwn(table, v);
const str = (v) => (typeof v === 'string' ? v : '');

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/* ---------------- config ---------------- */

function intEnv(env, name, fallback) {
  const v = env[name];
  if (v === undefined || v === '') return fallback;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0) throw new Error(name + ' must be a whole number of 0 or more (got "' + v + '")');
  return n;
}

function readConfig(env) {
  return {
    port: intEnv(env, 'PORT', 3000),
    host: env.HOST || undefined,
    databaseUrl: env.DATABASE_URL || '',
    dataFile: path.resolve(env.DATA_FILE || path.join(__dirname, 'data', 'events.json')),
    pins: { volunteer: env.VOLUNTEER_PIN || '', partner: env.PARTNER_PIN || '', admin: env.ADMIN_PIN || '' },
    rateLimit: intEnv(env, 'RATE_LIMIT_PER_MIN', 30),
    authFailLimit: intEnv(env, 'AUTH_FAIL_LIMIT_PER_MIN', 10),
    trustProxy: env.TRUST_PROXY === 'true' ? 1 : env.TRUST_PROXY === 'false' ? 0 : intEnv(env, 'TRUST_PROXY', 0),
    heartbeatMs: intEnv(env, 'SSE_HEARTBEAT_MS', 25000),
  };
}

/* ---------------- small helpers ---------------- */

// Compare SHA-256 digests with timingSafeEqual: the time taken does not depend on how much of the PIN matched.
function digest(s) {
  return crypto.createHash('sha256').update(String(s), 'utf8').digest();
}
function pinMatches(given, expected) {
  return crypto.timingSafeEqual(digest(given), digest(expected));
}

// Fixed-window counter per key (client IP). limit 0 turns it off.
function createLimiter(limit, windowMs = 60 * 1000) {
  const hits = new Map();
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [k, h] of hits) if (h.reset <= now) hits.delete(k);
  }, windowMs);
  sweep.unref();
  const secondsLeft = (h, now) => Math.max(1, Math.ceil((h.reset - now) / 1000));
  return {
    // Count one request. Returns 0 if allowed, otherwise seconds until the window resets.
    hit(key) {
      if (!limit) return 0;
      const now = Date.now();
      let h = hits.get(key);
      if (!h || h.reset <= now) hits.set(key, (h = { n: 0, reset: now + windowMs }));
      h.n++;
      return h.n > limit ? secondsLeft(h, now) : 0;
    },
    // Already at the limit? (does not count)
    blocked(key) {
      if (!limit) return 0;
      const now = Date.now();
      const h = hits.get(key);
      return h && h.reset > now && h.n >= limit ? secondsLeft(h, now) : 0;
    },
    stop() {
      clearInterval(sweep);
    },
  };
}

// Behind a proxy (Render, Railway...) every request comes from the proxy, so with TRUST_PROXY=n we take the
// address n hops back in X-Forwarded-For. Entries further left can be forged by the client and are ignored.
function clientIp(req, trustProxy) {
  const direct = req.socket.remoteAddress || 'unknown';
  if (!trustProxy) return direct;
  const xff = String(req.headers['x-forwarded-for'] || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!xff.length) return direct;
  return xff.length >= trustProxy ? xff[xff.length - trustProxy] : xff[0];
}

// Content-Security-Policy for the page: inline <script> blocks are allowed by their SHA-256 hash only.
// Styles need 'unsafe-inline' because the UI renders style="..." attributes.
function buildCsp(html) {
  const hashes = [];
  const re = /<script>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(html || ''))) hashes.push("'sha256-" + crypto.createHash('sha256').update(m[1], 'utf8').digest('base64') + "'");
  return [
    "default-src 'self'",
    ["script-src 'self'"].concat(hashes).join(' '),
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let tooBig = false;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > DRAIN_LIMIT) {
        req.destroy();
        return reject(new HttpError(413, 'Request body is larger than 32 KB.'));
      }
      if (size > BODY_LIMIT) {
        tooBig = true; // keep reading (and discarding) so the client gets a clean 413
        chunks.length = 0;
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (tooBig) reject(new HttpError(413, 'Request body is larger than 32 KB.'));
      else resolve(Buffer.concat(chunks).toString('utf8'));
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, obj, headers) {
  if (res.headersSent || res.destroyed) return void res.end();
  const body = JSON.stringify(obj);
  res.writeHead(status, Object.assign({
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
  }, headers));
  res.end(body);
}

function sendText(res, status, type, body, headers) {
  res.writeHead(status, Object.assign({ 'content-type': type, 'content-length': Buffer.byteLength(body) }, headers));
  res.end(body);
}

const secureRandom = () => crypto.randomInt(0, 2 ** 32) / 2 ** 32; // for reservation codes

/* ---------------- input clean-up ----------------
 * The domain module validates the business rules. These copy only the fields it reads and reject ids
 * that are not real Points, categories or drops (including "__proto__" and friends), so an event that
 * reaches the permanent log is always one the domain module can apply. */

function restockInput(input) {
  const counts = {};
  if (input.counts && typeof input.counts === 'object') {
    D.CATEGORIES.forEach((c) => {
      const r = hasOwn(input.counts, c.id) ? input.counts[c.id] : null;
      if (r && typeof r === 'object') counts[c.id] = { before: r.before, added: r.added, removed: r.removed };
    });
  }
  const ck = input.checklist && typeof input.checklist === 'object' ? input.checklist : {};
  return {
    pointId: input.pointId,
    counts,
    checklist: { sealed: ck.sealed === true, dated: ck.dated === true, shelfStable: ck.shelfStable === true },
  };
}

function dropInput(input) {
  return {
    partner: str(input.partner),
    title: str(input.title),
    kind: isKey(input.kind, D.DROP_KINDS) ? input.kind : '',
    qty: input.qty,
    place: str(input.place),
    windowMin: input.windowMin,
    sealed: input.sealed === true,
    labelled: input.labelled === true,
    cold: input.cold === true,
    bestBefore: str(input.bestBefore),
  };
}

/* ---------------- the app ---------------- */

async function start(cfg) {
  const store = createStore(cfg);
  const page = fs.existsSync(PAGE_FILE) ? fs.readFileSync(PAGE_FILE, 'utf8') : null;
  const domainJs = fs.readFileSync(DOMAIN_FILE, 'utf8');
  const csp = buildCsp(page);

  // In-memory copy of the log, folded into state with the shared domain module.
  let pilotStart = 0;
  let events = [];
  let indexById = new Map(); // event id -> position in `events` (for SSE replay)
  let state = null;
  let stateJson = null; // cached GET /api/state body
  let logToken = ''; // changes on every load (startup, reset); part of each SSE id

  function load(start, list) {
    pilotStart = start;
    events = list;
    indexById = new Map(events.map((e, i) => [e.id, i]));
    state = D.fold(events, pilotStart);
    stateJson = null;
    logToken = crypto.randomBytes(6).toString('hex');
  }

  const makeSeed = () => D.seedEvents(Date.now());
  const loaded = await store.init(makeSeed);
  load(loaded.pilotStart, loaded.events);

  /* ----- live updates (SSE) ----- */
  const streams = new Set();
  // SSE ids are "<logToken>.<event id>". The simulated pilot reuses the same event ids after a reset,
  // so the token is what tells a reconnecting page that its copy belongs to an older log.
  const evFrame = (ev) => 'id: ' + logToken + '.' + ev.id + '\nevent: ev\ndata: ' + JSON.stringify(ev) + '\n\n';
  // An SSE message with no data line is never delivered, so reset carries a small payload. It has no id on
  // purpose: a page that misses the reload keeps its old id and is told to reset again when it reconnects.
  const resetFrame = () => 'event: reset\ndata: ' + JSON.stringify({ pilotStart }) + '\n\n';

  function send(res, chunk) {
    if (res.writableLength > MAX_STREAM_BUFFER) {
      streams.delete(res);
      res.destroy();
      return;
    }
    res.write(chunk);
  }
  function broadcast(chunk) {
    for (const res of streams) send(res, chunk);
  }
  const heartbeat = cfg.heartbeatMs ? setInterval(() => broadcast(': heartbeat\n\n'), cfg.heartbeatMs) : null;

  function openStream(req, res, url) {
    if (streams.size >= MAX_STREAMS) return sendJson(res, 503, { ok: false, errors: ['Too many open connections. Try again soon.'] });
    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-store, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no', // ask proxies not to buffer the stream
    });
    res.write('retry: 3000\n\n');
    // Which event does the client already have? The browser sends Last-Event-ID when it reconnects; the page
    // passes ?lastEventId=<id> (a bare event id, from its /api/state snapshot) on the first connect.
    const claim = String(req.headers['last-event-id'] || url.searchParams.get('lastEventId') || '');
    const dot = claim.indexOf('.');
    const at = claim ? indexById.get(dot >= 0 ? claim.slice(dot + 1) : claim) : -1;
    if (claim && (at === undefined || (dot >= 0 && claim.slice(0, dot) !== logToken))) {
      res.write(resetFrame()); // its copy is from another log (reset or restart): reload
    } else if (at >= 0 && at < events.length - 1) {
      for (let k = at + 1; k < events.length; k++) res.write(evFrame(events[k])); // catch up
    } else if (events.length) {
      res.write('id: ' + logToken + '.' + events[events.length - 1].id + '\n\n'); // up to date: note where it is
    }
    streams.add(res);
    const done = () => streams.delete(res);
    res.on('close', done); // the connection went away (req 'close' can fire early on Node 16+)
    res.on('error', done);
  }

  /* ----- actions: one at a time, persisted before they are applied or broadcast ----- */
  let queue = Promise.resolve();
  function serialize(fn) {
    const run = queue.then(fn);
    queue = run.catch(() => {});
    return run;
  }

  function buildEvent(action, input, now) {
    switch (action) {
      case 'restock':
        if (!isKey(input.pointId, state.points)) return { ok: false, errors: ['Choose a FoodLink Point.'] };
        return D.restockEvent(state, restockInput(input), now);
      case 'report':
        if (!isKey(input.pointId, state.points) || !isKey(input.cat, D.CAT_BY_ID)) return { ok: false, errors: ['Unknown shelf.'] };
        return D.reportEvent(state, input.pointId, input.cat, now);
      case 'drop': {
        const res = D.dropEvent(dropInput(input), now);
        if (res.ok && hasOwn(Object.prototype, res.event.drop.partner)) return { ok: false, errors: ['Use a different partner name.'] };
        return res;
      }
      case 'reserve':
        if (!isKey(input.dropId, state.drops)) return { ok: false, errors: ['That drop no longer exists.'] };
        if (Object.keys(state.reservations).length >= MAX_CODES) return { ok: false, errors: ['No pickup codes left in this log.'] };
        return D.reserveEvent(state, input.dropId, now, secureRandom);
      case 'pickup':
        return D.pickupEvent(state, str(input.code), now);
      default:
        return { ok: false, errors: ['Unknown action.'] };
    }
  }

  async function performAction(action, input) {
    const last = events.length ? events[events.length - 1].at : 0;
    const now = Math.max(Date.now(), last); // server time, never earlier than the log (clock changes)
    let res;
    for (let tries = 0; tries < 5; tries++) {
      try {
        res = buildEvent(action, input, now);
      } catch (err) {
        return { status: 400, body: { ok: false, errors: ['That request could not be understood.'] } };
      }
      if (!res.ok || !indexById.has(res.event.id)) break; // retry on the (very unlikely) id collision
    }
    if (!res.ok) return { status: 400, body: { ok: false, errors: res.errors } };
    const ev = res.event;
    if (indexById.has(ev.id)) throw new Error('could not make a unique event id');
    D.apply(structuredClone(state), ev); // dry run: an event that cannot be applied never reaches the log
    await store.append(ev);
    D.apply(state, ev);
    indexById.set(ev.id, events.length);
    events.push(ev);
    stateJson = null;
    broadcast(evFrame(ev));
    const body = { ok: true, event: ev };
    if (res.warnings && res.warnings.length) body.warnings = res.warnings;
    return { status: 200, body };
  }

  async function performReset() {
    const seed = makeSeed();
    await store.reset(seed);
    load(seed.pilotStart, seed.events.slice());
    broadcast(resetFrame());
    console.log('[reset] event log replaced with a fresh simulated pilot (' + events.length + ' events)');
    return { status: 200, body: { ok: true, pilotStart, events: events.length } };
  }

  /* ----- auth + rate limits ----- */
  const publicLimiter = createLimiter(cfg.rateLimit);
  const authFailures = createLimiter(cfg.authFailLimit);

  function tooMany(res, seconds, message) {
    sendJson(res, 429, { ok: false, errors: [message + ' Try again in ' + seconds + ' s.'] }, { 'retry-after': String(seconds) });
  }

  // Returns true if the request may go ahead; otherwise it has already answered 401/429.
  function authorize(req, res, role, ip) {
    const expected = cfg.pins[role];
    if (!expected) return true;
    const wait = authFailures.blocked(ip);
    if (wait) {
      tooMany(res, wait, 'Too many wrong PINs from this device.');
      return false;
    }
    const given = req.headers['x-foodlink-pin'];
    if (typeof given === 'string' && given !== '') {
      if (pinMatches(given, expected)) return true;
      authFailures.hit(ip);
      sendJson(res, 401, { ok: false, errors: ['That ' + role + ' PIN is not right.'] });
      return false;
    }
    sendJson(res, 401, { ok: false, errors: ['Enter the ' + role + ' PIN to do this.'] });
    return false;
  }

  /* ----- routes ----- */
  function allow(req, res, methods) {
    if (methods.includes(req.method)) return true;
    sendJson(res, 405, { ok: false, errors: ['Method not allowed.'] }, { allow: methods.join(', ') });
    return false;
  }

  async function handleAction(req, res) {
    const raw = await readBody(req);
    if (!/^application\/json\b/i.test(req.headers['content-type'] || '')) {
      return sendJson(res, 415, { ok: false, errors: ['Send JSON with content-type: application/json.'] });
    }
    let body;
    try {
      body = JSON.parse(raw);
    } catch (err) {
      return sendJson(res, 400, { ok: false, errors: ['Body must be valid JSON.'] });
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return sendJson(res, 400, { ok: false, errors: ['Body must be a JSON object.'] });
    const action = body.action;
    if (!isKey(action, ACTIONS)) return sendJson(res, 400, { ok: false, errors: ['Unknown action.'] });
    const spec = ACTIONS[action];
    const ip = clientIp(req, cfg.trustProxy);
    if (spec.limited) {
      const wait = publicLimiter.hit(ip);
      if (wait) return tooMany(res, wait, 'Too many requests from this device.');
    }
    if (spec.role && !authorize(req, res, spec.role, ip)) return;
    const input = body.input;
    if (!input || typeof input !== 'object' || Array.isArray(input)) return sendJson(res, 400, { ok: false, errors: ['Missing input.'] });
    const out = await serialize(() => performAction(action, input));
    sendJson(res, out.status, out.body);
  }

  async function handleReset(req, res) {
    await readBody(req); // ignored, but read so the connection stays clean
    if (!authorize(req, res, 'admin', clientIp(req, cfg.trustProxy))) return;
    const out = await serialize(performReset);
    sendJson(res, out.status, out.body);
  }

  async function handleHealth(res) {
    try {
      await store.health();
    } catch (err) {
      return sendJson(res, 503, { ok: false, store: store.name, errors: ['Database unreachable.'] });
    }
    sendJson(res, 200, { ok: true, store: store.name, events: events.length, streams: streams.size, uptimeSec: Math.round(process.uptime()) });
  }

  async function handle(req, res) {
    res.setHeader('Content-Security-Policy', csp);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    let url;
    try {
      url = new URL(req.url, 'http://localhost');
    } catch (err) {
      return sendJson(res, 400, { ok: false, errors: ['Bad URL.'] });
    }
    const p = url.pathname;
    if (p === '/' || p === '/index.html') {
      if (!allow(req, res, ['GET', 'HEAD'])) return;
      if (!page) return sendText(res, 503, 'text/plain; charset=utf-8', 'FoodLink page not built yet. Run "npm run build" (npm start does this), then restart.\n');
      return sendText(res, 200, 'text/html; charset=utf-8', page, { 'cache-control': 'no-cache' });
    }
    if (p === '/domain.js') {
      if (!allow(req, res, ['GET', 'HEAD'])) return;
      return sendText(res, 200, 'application/javascript; charset=utf-8', domainJs, { 'cache-control': 'no-cache' });
    }
    if (p === '/favicon.ico') {
      res.writeHead(204, { 'cache-control': 'max-age=86400' });
      return res.end();
    }
    if (p === '/api/state') {
      if (!allow(req, res, ['GET', 'HEAD'])) return;
      if (!stateJson) stateJson = JSON.stringify({ pilotStart, events });
      return sendText(res, 200, 'application/json; charset=utf-8', stateJson, { 'cache-control': 'no-store' });
    }
    if (p === '/api/stream') return allow(req, res, ['GET']) && openStream(req, res, url);
    if (p === '/api/actions') return allow(req, res, ['POST']) && handleAction(req, res);
    if (p === '/api/reset') return allow(req, res, ['POST']) && handleReset(req, res);
    if (p === '/api/health') return allow(req, res, ['GET', 'HEAD']) && handleHealth(res);
    if (p.startsWith('/api/')) return sendJson(res, 404, { ok: false, errors: ['Not found.'] });
    return sendText(res, 404, 'text/plain; charset=utf-8', 'Not found\n');
  }

  const server = http.createServer((req, res) => {
    handle(req, res).catch((err) => {
      if (err instanceof HttpError) return sendJson(res, err.status, { ok: false, errors: [err.message] });
      console.error('[http] ' + req.method + ' ' + String(req.url).split('?')[0] + ' failed:', err);
      sendJson(res, 500, { ok: false, errors: ['Something went wrong on the server. Try again.'] });
    });
  });
  // Behind a load balancer, keep idle connections open longer than it does (avoids rare 502s).
  server.keepAliveTimeout = 65 * 1000;
  server.headersTimeout = 66 * 1000;

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(cfg.port, cfg.host, resolve);
  });

  async function close() {
    if (heartbeat) clearInterval(heartbeat);
    publicLimiter.stop();
    authFailures.stop();
    const closed = new Promise((resolve) => server.close(() => resolve())); // stop accepting connections
    for (const res of streams) res.end();
    streams.clear();
    server.closeIdleConnections();
    await queue; // let an in-flight write finish and its response go out
    const force = setTimeout(() => server.closeAllConnections(), 1000);
    await closed;
    clearTimeout(force);
    await store.close();
  }

  return { server, store, close, port: server.address().port, loaded, csp };
}

/* ---------------- main ---------------- */

async function main() {
  let cfg;
  try {
    cfg = readConfig(process.env);
  } catch (err) {
    console.error('FoodLink: ' + err.message);
    process.exit(1);
  }
  let app;
  try {
    app = await start(cfg);
  } catch (err) {
    console.error('FoodLink could not start: ' + err.message);
    process.exit(1);
  }
  const { store, loaded } = app;
  console.log('FoodLink server');
  console.log('  store:      ' + (store.name === 'postgres' ? 'PostgreSQL (' + store.where + ')' : 'JSON file ' + store.where + ' (no DATABASE_URL set)'));
  if (loaded.applied.length) console.log('  migrations: applied ' + loaded.applied.join(', '));
  console.log('  events:     ' + loaded.events.length + ' loaded' + (loaded.seeded ? ' (log was empty: seeded the simulated pilot)' : ''));
  console.log('  clock:      ' + process.env.TZ);
  console.log('  rate limit: ' + (cfg.rateLimit ? cfg.rateLimit + ' reports/reservations per minute per device' : 'off') +
    (cfg.trustProxy ? ' (client IP from X-Forwarded-For, ' + cfg.trustProxy + ' proxy hop)' : ''));
  const gates = [
    ['VOLUNTEER_PIN', cfg.pins.volunteer, 'log restocks'],
    ['PARTNER_PIN', cfg.pins.partner, 'post surplus drops and confirm pickups'],
    ['ADMIN_PIN', cfg.pins.admin, 'reset the demo, which wipes the event log'],
  ];
  // Warnings go to stdout with the rest of the banner so they always print in order.
  for (const [name, value, what] of gates) {
    if (!value) console.log('  WARNING: ' + name + ' is not set, so anyone can ' + what + ' (demo mode).');
    else if (value.length < 6) console.log('  note: ' + name + ' is short; wrong guesses are limited to ' + cfg.authFailLimit + ' a minute per device.');
  }
  console.log('FoodLink listening on http://localhost:' + app.port);

  let stopping = false;
  const shutdown = (signal) => {
    if (stopping) return;
    stopping = true;
    console.log('FoodLink: ' + signal + ' received, shutting down');
    setTimeout(() => process.exit(1), 10000).unref();
    app.close().then(() => process.exit(0), (err) => {
      console.error('FoodLink: error while shutting down: ' + err.message);
      process.exit(1);
    });
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

if (require.main === module) main();

module.exports = { start, readConfig, buildCsp, pinMatches, createLimiter, clientIp };
