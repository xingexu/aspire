'use strict';
// Purple Hub server: serves the built page and a JSON API backed by PostgreSQL. Run: npm start, then open the printed address.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');

// Optional private settings, such as OPENAI_API_KEY, in purplehub/.env (never committed).
try {
  for (const l of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split('\n')) {
    const m = l.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch (e) { /* no .env file */ }

const db = require('./db');
const chat = require('./chat');

const PORT = Number(process.env.PORT) || 3001;
const PAGE = path.join(ROOT, 'dist', 'index.html');
const DATA = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'data.json'), 'utf8'));
const WESTERN_EMAIL = /^[^\s@]+@uwo\.ca$/;
const IG_POST = /^https:\/\/www\.instagram\.com\/(p|reel)\/[\w-]+\/$/;
const IMG = /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/;
const SESSION_DAYS = 14;
const AUTH_TRIES = Number(process.env.AUTH_TRIES) || 40;
const SECURE = process.env.NODE_ENV === 'production';
// Without this code nobody can register as USC staff. Set it in .env, or use the one printed at startup.
const INVITE = process.env.ADMIN_INVITE_CODE || crypto.randomBytes(9).toString('base64url');

let pool, opening = null;
// Vercel has no local database: it needs DATABASE_URL. Until that's set, events and the assistant still work.
const HOSTED = !!process.env.VERCEL;
function connect() {
  if (pool) return Promise.resolve(pool);
  if (HOSTED && !process.env.DATABASE_URL) return Promise.resolve(null);
  if (!opening) {
    const url = process.env.DATABASE_URL || require('../scripts/db').start();
    opening = db.open(url, DATA.clubs, HOSTED ? 2 : 10).then((p) => { pool = p; return p; }, (e) => { opening = null; throw e; });
  }
  return opening;
}
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
class Fail extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const need = (ok, status, msg) => { if (!ok) throw new Fail(status, msg); };
const clean = (v, max, label) => { const s = typeof v === 'string' ? v.trim() : ''; need(s && s.length <= max, 400, 'Please check ' + label + '.'); return s; };
const hasClub = (id) => typeof id === 'string' && Object.prototype.hasOwnProperty.call(DATA.clubs, id);

// A small in-memory limit on password guessing and on paid model calls.
const hits = new Map();
function limit(key, max, ms) {
  const now = Date.now(), h = hits.get(key);
  if (!h || h.until < now) { if (hits.size > 5000) hits.clear(); hits.set(key, { n: 1, until: now + ms }); return; }
  h.n++;
  need(h.n <= max, 429, 'Too many tries. Please wait a few minutes.');
}

/* ---------- sessions ---------- */
async function currentUser(req) {
  const m = (req.headers.cookie || '').match(/(?:^|;\s*)purplehub=([\w-]+)/);
  if (!m) return null;
  const { rows } = await pool.query('SELECT u.id, u.email, u.name, u.role, u.club, u.approved FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = $1 AND s.expires_at > now()', [sha(m[1])]);
  return rows[0] || null;
}
async function startSession(res, userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  await pool.query("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, now() + make_interval(days => $3))", [sha(token), userId, SESSION_DAYS]);
  res.setHeader('set-cookie', 'purplehub=' + token + '; HttpOnly; SameSite=Lax; Path=/; Max-Age=' + SESSION_DAYS * 86400 + (SECURE ? '; Secure' : ''));
}
const publicUser = (u) => u && { id: String(u.id), email: u.email, name: u.name, role: u.role, club: u.club, approved: u.approved };
const inboxesOf = (u) => (!u || !u.approved ? [] : u.role === 'admin' ? ['usc'] : u.role === 'club' ? [u.club] : []);
const inboxName = (x) => (x === 'usc' ? 'USC' : DATA.clubs[x].short);

/* ---------- live updates: anyone signed in holds one open connection per tab ---------- */
const streams = new Map();
function notify(userIds) { for (const id of new Set(userIds.map(String))) for (const r of streams.get(id) || []) r.write('event: change\ndata: {}\n\n'); }
const notifyEveryone = () => notify([...streams.keys()]);
async function membersOf(inbox) {
  const { rows } = inbox === 'usc' ? await pool.query("SELECT id FROM users WHERE role = 'admin' AND approved") : await pool.query("SELECT id FROM users WHERE role = 'club' AND approved AND club = $1", [inbox]);
  return rows.map((r) => r.id);
}

/* ---------- reading ---------- */
const postJson = (p) => ({ id: String(p.id), custom: true, club: p.club, title: p.title, date: p.date_text, place: p.place, ends: new Date(p.ends_at).getTime(), at: new Date(p.ends_at).getTime(), post: p.post_url, img: p.img, cat: p.cat, status: p.status, note: p.note });
const fundJson = (f) => ({ id: String(f.id), club: f.club, event: f.event, items: f.items, amount: Number(f.amount), attendance: f.attendance, purpose: f.purpose, neededBy: new Date(f.needed_by).toISOString().slice(0, 10), status: f.status, note: f.note });
async function threadsFor(u) {
  const inboxes = inboxesOf(u);
  const { rows } = await pool.query(`SELECT t.id, t.owner_id, t.inbox, t.updated_at, o.name AS owner_name, COALESCE(r.last_read_id, 0) AS last_read,
      (SELECT json_agg(json_build_object('id', m.id, 'from', m.sender_id, 'body', m.body, 'at', m.created_at) ORDER BY m.id) FROM messages m WHERE m.thread_id = t.id) AS messages
    FROM threads t JOIN users o ON o.id = t.owner_id LEFT JOIN thread_reads r ON r.thread_id = t.id AND r.user_id = $1
    WHERE t.owner_id = $1 OR t.inbox = ANY($2) ORDER BY t.updated_at DESC`, [u.id, inboxes]);
  return rows.map((t) => {
    const msgs = t.messages || [], mine = String(t.owner_id) === String(u.id);
    return { id: String(t.id), inbox: t.inbox, title: mine ? inboxName(t.inbox) : t.owner_name, subtitle: mine ? (t.inbox === 'usc' ? 'University Students’ Council' : DATA.clubs[t.inbox].name) : 'To ' + inboxName(t.inbox),
      unread: msgs.filter((m) => m.id > Number(t.last_read) && String(m.from) !== String(u.id)).length,
      messages: msgs.map((m) => ({ id: String(m.id), mine: String(m.from) === String(u.id), body: m.body, at: new Date(m.at).getTime() })) };
  });
}
async function bootstrap(u) {
  const out = { user: publicUser(u), posts: [], mine: [], requests: [], funding: [], accounts: [], threads: [] };
  out.posts = (await pool.query("SELECT * FROM posts WHERE status = 'approved'")).rows.map(postJson);
  if (!u) return out;
  out.threads = await threadsFor(u);
  if (u.role === 'club' && u.approved) {
    out.mine = (await pool.query('SELECT * FROM posts WHERE club = $1 ORDER BY id DESC', [u.club])).rows.map(postJson);
    out.funding = (await pool.query('SELECT * FROM funding_requests WHERE club = $1 ORDER BY id DESC', [u.club])).rows.map(fundJson);
  }
  if (u.role === 'admin' && u.approved) {
    out.requests = (await pool.query('SELECT * FROM posts ORDER BY id DESC')).rows.map(postJson);
    out.funding = (await pool.query('SELECT * FROM funding_requests ORDER BY id DESC')).rows.map(fundJson);
    out.accounts = (await pool.query("SELECT id, name, email, club FROM users WHERE role = 'club' AND NOT approved ORDER BY id")).rows.map((a) => ({ ...a, id: String(a.id) }));
  }
  return out;
}

/* ---------- writing ---------- */
const api = {
  async 'POST /api/signup'(b, u, req, res) {
    limit('auth:' + req.socket.remoteAddress, AUTH_TRIES, 900000);
    const email = clean(b.email, 200, 'your email').toLowerCase(), name = clean(b.name, 80, 'your name');
    need(WESTERN_EMAIL.test(email), 400, 'Please use your Western email, ending in @uwo.ca.');
    need(typeof b.password === 'string' && b.password.length >= 8 && b.password.length <= 200, 400, 'Please choose a password of at least 8 characters.');
    need(['student', 'club', 'admin'].includes(b.role), 400, 'Please choose who you are.');
    if (b.role === 'club') need(hasClub(b.club), 400, 'Please choose your club.');
    if (b.role === 'admin') {
      const given = Buffer.from(sha(String(b.invite || ''))), want = Buffer.from(sha(INVITE));
      need(crypto.timingSafeEqual(given, want), 403, 'That invite code isn’t right. USC staff get it from a USC admin.');
    }
    const hash = await new Promise((resolve) => setImmediate(() => resolve(db.hashPassword(b.password))));
    // A president can read their club's messages and post for it, so the USC confirms them first.
    const { rows } = await pool.query('INSERT INTO users (email, name, password_hash, role, club, approved) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (email) DO NOTHING RETURNING id, email, name, role, club, approved', [email, name, hash, b.role, b.role === 'club' ? b.club : null, b.role !== 'club']);
    need(rows.length, 409, 'That email already has an account. Try signing in.');
    await startSession(res, rows[0].id);
    if (b.role === 'club') notify(await membersOf('usc'));
    return { ok: true };
  },
  async 'POST /api/login'(b, u, req, res) {
    limit('auth:' + req.socket.remoteAddress, AUTH_TRIES, 900000);
    const email = String(b.email || '').trim().toLowerCase();
    const { rows } = await pool.query('SELECT id, password_hash FROM users WHERE email = $1', [email]);
    need(rows.length && typeof b.password === 'string' && db.checkPassword(b.password, rows[0].password_hash), 401, 'That email or password isn’t right.');
    await startSession(res, rows[0].id);
    return { ok: true };
  },
  async 'POST /api/logout'(b, u, req, res) {
    const m = (req.headers.cookie || '').match(/(?:^|;\s*)purplehub=([\w-]+)/);
    if (m) await pool.query('DELETE FROM sessions WHERE token_hash = $1', [sha(m[1])]);
    res.setHeader('set-cookie', 'purplehub=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0' + (SECURE ? '; Secure' : ''));
    return { ok: true };
  },
  async 'POST /api/posts'(b, u) {
    need(u && u.role === 'club' && u.approved, 403, 'Only approved club presidents can post.');
    const ends = Number(b.ends);
    need(Number.isFinite(ends) && ends > Date.now() - 86400000, 400, 'Please check the last day of the event.');
    need(DATA.categories.includes(b.cat), 400, 'Please choose a category.');
    const url = b.post || '', img = b.img || '';
    need(!url || IG_POST.test(url), 400, 'Please check the Instagram link.');
    need(!img || (IMG.test(img) && img.length < 1500000), 400, 'That picture is too large.');
    need(url || img, 400, 'Please add an Instagram link or a picture.');
    await pool.query('INSERT INTO posts (club, author_id, title, date_text, place, ends_at, post_url, img, cat) VALUES ($1,$2,$3,$4,$5,to_timestamp($6),$7,$8,$9)',
      [u.club, u.id, clean(b.title, 80, 'the name'), clean(b.date, 80, 'the time'), clean(b.place, 100, 'the place'), ends / 1000, url, img, b.cat]);
    notify([...await membersOf('usc'), ...await membersOf(u.club)]);
    return { ok: true };
  },
  async 'DELETE /api/posts/:id'(b, u, req, res, id) {
    need(u && u.role === 'club' && u.approved, 403, 'Only club presidents can remove posts.');
    const { rowCount } = await pool.query('DELETE FROM posts WHERE id = $1 AND club = $2', [id, u.club]);
    need(rowCount, 404, 'That post is gone.');
    notifyEveryone();
    return { ok: true };
  },
  async 'POST /api/funding'(b, u) {
    need(u && u.role === 'club' && u.approved, 403, 'Only confirmed club presidents can request funding.');
    need(Array.isArray(b.items) && b.items.length && b.items.length <= 20, 400, 'Please add at least one thing to your budget.');
    const items = b.items.map((x) => {
      const cost = Number(x && x.cost);
      need(Number.isFinite(cost) && cost > 0 && cost <= 100000, 400, 'Please check the costs in your budget.');
      return { what: clean(x.what, 80, 'your budget items'), cost: Math.round(cost * 100) / 100 };
    });
    const amount = Math.round(items.reduce((t, x) => t + x.cost, 0) * 100) / 100; // always added up here, never trusted from the page
    need(amount <= 100000, 400, 'That total is too large.');
    const attendance = Number(b.attendance);
    need(Number.isInteger(attendance) && attendance > 0 && attendance <= 100000, 400, 'Please say how many people you expect.');
    need(/^\d{4}-\d{2}-\d{2}$/.test(b.neededBy || '') && !Number.isNaN(Date.parse(b.neededBy)), 400, 'Please choose when you need it by.');
    await pool.query('INSERT INTO funding_requests (club, author_id, event, items, amount, attendance, purpose, needed_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
      [u.club, u.id, clean(b.event, 100, 'the event'), JSON.stringify(items), amount, attendance, clean(b.purpose, 500, 'what it’s for'), b.neededBy]);
    notify([...await membersOf('usc'), ...await membersOf(u.club)]);
    return { ok: true };
  },
  async 'POST /api/funding/:id/decide'(b, u, req, res, id) {
    need(u && u.role === 'admin' && u.approved, 403, 'USC admins only.');
    need(['approved', 'declined'].includes(b.status), 400, 'Please choose a decision.');
    const note = typeof b.note === 'string' ? b.note.trim().slice(0, 300) : '';
    need(b.status === 'approved' || note, 400, 'Please give a short reason, so the club knows what to change.');
    const { rows } = await pool.query("UPDATE funding_requests SET status = $2, note = $3 WHERE id = $1 RETURNING club", [id, b.status, note]);
    need(rows.length, 404, 'That request is gone.');
    notify([...await membersOf('usc'), ...await membersOf(rows[0].club)]);
    return { ok: true };
  },
  async 'POST /api/posts/:id/review'(b, u, req, res, id) {
    need(u && u.role === 'admin' && u.approved, 403, 'USC admins only.');
    need(['approved', 'declined'].includes(b.status), 400, 'Please choose a decision.');
    const note = typeof b.note === 'string' ? b.note.trim().slice(0, 300) : '';
    need(b.status === 'approved' || note, 400, 'Please give a short reason, so the club knows what to change.');
    const { rowCount } = await pool.query('UPDATE posts SET status = $2, note = $3 WHERE id = $1', [id, b.status, note]);
    need(rowCount, 404, 'That post is gone.');
    notifyEveryone();
    return { ok: true };
  },
  async 'POST /api/accounts/:id/decide'(b, u, req, res, id) {
    need(u && u.role === 'admin' && u.approved, 403, 'USC admins only.');
    // Declining keeps the person's account, as a student.
    const { rowCount } = await pool.query(b.approve ? "UPDATE users SET approved = true WHERE id = $1 AND role = 'club'" : "UPDATE users SET role = 'student', club = NULL, approved = true WHERE id = $1 AND role = 'club'", [id]);
    need(rowCount, 404, 'That account is gone.');
    notify([id, u.id]);
    return { ok: true };
  },
  async 'POST /api/messages'(b, u) {
    need(u, 401, 'Please sign in to send messages.');
    const body = clean(b.body, 2000, 'your message');
    let thread;
    if (b.thread) {
      const { rows } = await pool.query('SELECT id, owner_id, inbox FROM threads WHERE id = $1', [b.thread]);
      need(rows.length && (String(rows[0].owner_id) === String(u.id) || inboxesOf(u).includes(rows[0].inbox)), 403, 'You can’t reply in that conversation.');
      thread = rows[0];
    } else {
      need(b.inbox === 'usc' || hasClub(b.inbox), 400, 'Please choose who to message.');
      need(!inboxesOf(u).includes(b.inbox), 400, 'That’s your own inbox.');
      thread = (await pool.query('INSERT INTO threads (owner_id, inbox) VALUES ($1,$2) ON CONFLICT (owner_id, inbox) DO UPDATE SET updated_at = now() RETURNING id, owner_id, inbox', [u.id, b.inbox])).rows[0];
    }
    const m = (await pool.query('INSERT INTO messages (thread_id, sender_id, body) VALUES ($1,$2,$3) RETURNING id', [thread.id, u.id, body])).rows[0];
    await pool.query('UPDATE threads SET updated_at = now() WHERE id = $1', [thread.id]);
    await pool.query('INSERT INTO thread_reads (user_id, thread_id, last_read_id) VALUES ($1,$2,$3) ON CONFLICT (user_id, thread_id) DO UPDATE SET last_read_id = EXCLUDED.last_read_id', [u.id, thread.id, m.id]);
    notify([thread.owner_id, ...await membersOf(thread.inbox)]);
    return { thread: String(thread.id) };
  },
  async 'POST /api/threads/:id/read'(b, u, req, res, id) {
    need(u, 401, 'Please sign in.');
    const { rows } = await pool.query('SELECT owner_id, inbox, (SELECT max(id) FROM messages WHERE thread_id = t.id) AS last FROM threads t WHERE id = $1', [id]);
    need(rows.length && (String(rows[0].owner_id) === String(u.id) || inboxesOf(u).includes(rows[0].inbox)), 403, 'Not your conversation.');
    if (rows[0].last) await pool.query('INSERT INTO thread_reads (user_id, thread_id, last_read_id) VALUES ($1,$2,$3) ON CONFLICT (user_id, thread_id) DO UPDATE SET last_read_id = EXCLUDED.last_read_id', [u.id, id, rows[0].last]);
    return { ok: true };
  },
  async 'POST /api/chat'(b, u, req) {
    limit('chat:' + req.socket.remoteAddress, 40, 300000);
    need(Array.isArray(b.messages) && b.messages.length, 400, 'Please ask a question.');
    const history = b.messages.slice(-10).map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content || '').slice(0, 1000) }));
    need(history[history.length - 1].role === 'user' && history[history.length - 1].content.trim(), 400, 'Please ask a question.');
    const approved = (await pool.query("SELECT club, title, date_text, place, ends_at, cat FROM posts WHERE status = 'approved'")).rows.map((p) => ({ club: p.club, title: p.title, date: p.date_text, place: p.place, ends: p.ends_at, cat: p.cat }));
    return chat.reply(history, { ...DATA, events: [...DATA.events, ...approved] });
  },
};
const routes = Object.entries(api).map(([k, fn]) => {
  const [method, p] = k.split(' ');
  return { method, re: new RegExp('^' + p.replace(':id', '(\\d+)') + '$'), fn };
});

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const parts = [];
    req.on('data', (d) => { size += d.length; if (size > 2000000) { reject(new Fail(413, 'That’s too large.')); req.destroy(); } else parts.push(d); });
    req.on('end', () => { try { resolve(parts.length ? JSON.parse(Buffer.concat(parts).toString('utf8')) : {}); } catch (e) { reject(new Fail(400, 'Bad request.')); } });
    req.on('error', reject);
  });
}
const json = (res, status, body) => { res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(body)); };

async function handle(req, res) {
  const url = req.url.split('?')[0];
  if (url === '/' || url === '/index.html') {
    return fs.readFile(PAGE, (err, body) => {
      if (err) { res.writeHead(500, { 'content-type': 'text/plain' }); return res.end('Run npm run build first.'); }
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      res.end(body);
    });
  }
  if (!url.startsWith('/api/')) { res.writeHead(404, { 'content-type': 'text/plain' }); return res.end('Not found'); }
  try {
    await connect().catch((e) => { if (!HOSTED) throw e; console.error('Database unavailable:', e.message); });
    if (!pool) {
      if (req.method === 'GET' && url === '/api/data') return json(res, 200, { user: null, posts: [], mine: [], requests: [], funding: [], accounts: [], threads: [] });
      if (req.method === 'POST' && url === '/api/chat') {
        need(req.headers['x-purplehub'] === '1', 403, 'Bad request.');
        const b = await readBody(req);
        need(Array.isArray(b.messages) && b.messages.length, 400, 'Please ask a question.');
        return json(res, 200, await chat.reply(b.messages.slice(-10).map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content || '').slice(0, 1000) })), DATA));
      }
      return json(res, 503, { error: 'Accounts aren’t connected on this site yet. You can still browse events.' });
    }
    const u = await currentUser(req);
    if (req.method === 'GET' && url === '/api/data') return json(res, 200, await bootstrap(u));
    if (req.method === 'GET' && url === '/api/stream') {
      need(u, 401, 'Please sign in.');
      need(!HOSTED, 503, 'Live connections aren’t available here.'); // functions can't stay open, so the page checks for updates instead
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
      res.write(': connected\n\n');
      const id = String(u.id);
      if (!streams.has(id)) streams.set(id, new Set());
      streams.get(id).add(res);
      const ping = setInterval(() => res.write(': ping\n\n'), 25000);
      req.on('close', () => { clearInterval(ping); streams.get(id).delete(res); if (!streams.get(id).size) streams.delete(id); });
      return undefined;
    }
    // Browsers won't send this header from another site's form, which stops forged requests riding on the cookie.
    need(req.headers['x-purplehub'] === '1', 403, 'Bad request.');
    for (const r of routes) {
      const m = req.method === r.method && url.match(r.re);
      if (m) return json(res, 200, await r.fn(await readBody(req), u, req, res, m[1]));
    }
    return json(res, 404, { error: 'Not found' });
  } catch (e) {
    if (e instanceof Fail) return json(res, e.status, { error: e.message });
    console.error(e);
    return json(res, 500, { error: 'Something went wrong. Please try again.' });
  }
}

if (require.main === module) {
  connect().then(() => {
    http.createServer((req, res) => { handle(req, res); }).listen(PORT, () => {
      console.log('Purple Hub listening on http://localhost:' + PORT);
      if (!process.env.ADMIN_INVITE_CODE) console.log('USC staff invite code for this run: ' + INVITE);
      console.log(process.env.OPENAI_API_KEY ? 'Assistant: GPT (' + (process.env.OPENAI_MODEL || 'gpt-4o-mini') + ')' : 'Assistant: built-in answers. Add OPENAI_API_KEY to purplehub/.env to use GPT.');
    });
  }).catch((e) => {
    console.error('Could not start: ' + e.message + '\nCheck that PostgreSQL is installed, or set DATABASE_URL to a database of your own.');
    process.exit(1);
  });
}

module.exports = { handle };
