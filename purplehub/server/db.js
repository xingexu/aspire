'use strict';
// PostgreSQL: connects (creating the database if it's missing), runs migrations, and adds demo data to an empty database.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Pool, Client } = require('pg');

const MIGRATIONS = path.join(__dirname, 'migrations');
const MIGRATION_LOCK = 7262027;

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  return salt.toString('hex') + ':' + crypto.scryptSync(password, salt, 64).toString('hex');
}
function checkPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const want = Buffer.from(hash, 'hex');
  return crypto.timingSafeEqual(crypto.scryptSync(password, Buffer.from(salt, 'hex'), 64), want);
}

async function createDatabaseIfMissing(url) {
  const u = new URL(url), name = u.pathname.slice(1);
  if (!/^\w+$/.test(name)) throw new Error('The database name in DATABASE_URL can only use letters, numbers and _.');
  u.pathname = '/postgres';
  const c = new Client({ connectionString: u.toString() });
  await c.connect();
  try { await c.query('CREATE DATABASE ' + name); } finally { await c.end(); }
  console.log('Created database ' + name);
}

async function migrate(pool) {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    await c.query('SELECT pg_advisory_xact_lock($1)', [MIGRATION_LOCK]);
    await c.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
    const done = new Set((await c.query('SELECT name FROM schema_migrations')).rows.map((r) => r.name));
    for (const f of fs.readdirSync(MIGRATIONS).filter((n) => n.endsWith('.sql')).sort()) {
      if (done.has(f)) continue;
      await c.query(fs.readFileSync(path.join(MIGRATIONS, f), 'utf8'));
      await c.query('INSERT INTO schema_migrations (name) VALUES ($1)', [f]);
    }
    await c.query('COMMIT');
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    throw e;
  } finally { c.release(); }
}

// Sample accounts and conversations so the app isn't empty in a demo. Never added in production.
const DEMO_PASSWORD = process.env.DEMO_PASSWORD || 'purplehub-demo';
// A public site only gets demo accounts if it's given its own private password.
const demoAllowed = () => (process.env.NODE_ENV !== 'production' || !!process.env.DEMO_PASSWORD) && process.env.SEED_DEMO !== '0';
async function seed(pool, clubs) {
  const { rows } = await pool.query('SELECT count(*)::int AS n FROM users');
  if (rows[0].n) return false;
  const hash = hashPassword(DEMO_PASSWORD);
  const add = async (email, name, role, club) => (await pool.query('INSERT INTO users (email, name, password_hash, role, club) VALUES ($1,$2,$3,$4,$5) RETURNING id', [email, name, hash, role, club || null])).rows[0].id;
  const usc = await add('usc.demo@uwo.ca', 'USC staff', 'admin');
  const pres = {};
  for (const c of Object.values(clubs)) pres[c.id] = await add(c.id + '.demo@uwo.ca', c.short + ' president', 'club', c.id);
  const zinger = await add('zinger.demo@uwo.ca', 'Xinge Xu (Zinger)', 'student');
  const nuo = await add('nuo.demo@uwo.ca', 'Nuo Zhang', 'student');
  const zohra = await add('zohra.demo@uwo.ca', 'Zohra Khawaja', 'student');
  const ahana = await add('ahana.demo@uwo.ca', 'Ahana Gehlot', 'student');
  const chat = async (owner, inbox, lines) => {
    const t = (await pool.query('INSERT INTO threads (owner_id, inbox) VALUES ($1,$2) RETURNING id', [owner, inbox])).rows[0].id;
    let minutes = 180 + lines.length * 20;
    for (const [sender, body] of lines) {
      minutes -= 20;
      await pool.query("INSERT INTO messages (thread_id, sender_id, body, created_at) VALUES ($1,$2,$3, now() - make_interval(mins => $4))", [t, sender, body, minutes]);
    }
    await pool.query("UPDATE threads SET updated_at = now() - make_interval(mins => $2) WHERE id = $1", [t, minutes]);
  };
  await chat(zinger, 'usc', [[zinger, 'Hi! How would my club get funding for an event through Purple Hub?'], [usc, 'Your club president adds the post and asks for funding in the same step. We review both together.'], [zinger, 'Perfect, thank you!']]);
  await chat(nuo, 'wfn', [[nuo, 'Is Design & Defend okay for someone with no Figma experience?'], [pres.wfn, 'Yes, no experience needed. We teach the basics first.']]);
  await chat(zohra, 'pbsn', [[zohra, 'Will there be another case competition after ASPIRE this term?']]);
  await chat(ahana, 'csa', [[ahana, 'Do I need to be a CSA member to come to the AGM?'], [pres.csa, 'Everyone’s welcome to come and say hi! Membership gets you the merch.'], [ahana, 'Great, see you Monday.']]);
  return true;
}

// A sample request, so the USC dashboard has something to review in a demo.
async function seedFunding(pool) {
  if ((await pool.query('SELECT 1 FROM funding_requests LIMIT 1')).rows.length) return;
  const { rows } = await pool.query("SELECT id FROM users WHERE email = 'wfn.demo@uwo.ca'");
  if (!rows.length) return;
  const items = [{ what: 'Dinner for competitors', cost: 300 }, { what: 'Prizes', cost: 120 }];
  await pool.query("INSERT INTO funding_requests (club, author_id, event, items, amount, attendance, purpose, needed_by) VALUES ('wfn', $1, 'Design & Defend', $2, 420, 60, 'Dinner and prizes for a hands-on design competition, open to students with no experience.', '2026-11-03')", [rows[0].id, JSON.stringify(items)]);
}

// Supabase signs its database certificates with its own authority, so trust exactly that one and keep checking.
const sslFor = (url) => (/\.supabase\.com/.test(url) ? { ca: fs.readFileSync(path.join(__dirname, 'supabase-ca.pem'), 'utf8'), rejectUnauthorized: true } : undefined);

async function open(url, clubs, max = 10) {
  const ssl = sslFor(url);
  let pool = new Pool({ connectionString: url, max, ssl });
  try {
    await pool.query('SELECT 1');
  } catch (e) {
    await pool.end().catch(() => {});
    if (e.code !== '3D000') throw e;
    await createDatabaseIfMissing(url);
    pool = new Pool({ connectionString: url, max, ssl });
  }
  // An idle connection dropping (say, PostgreSQL restarting) must not take the whole server down.
  pool.on('error', (e) => console.warn('Database connection lost:', e.message));
  await migrate(pool);
  if (demoAllowed() && await seed(pool, clubs)) {
    console.log('Added demo accounts. See README.md.');
  }
  if (demoAllowed()) await seedFunding(pool);
  return pool;
}

module.exports = { open, hashPassword, checkPassword };
