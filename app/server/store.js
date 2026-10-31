'use strict';
/*
 * Where the FoodLink event log is kept.
 *   PgStore   - PostgreSQL (used when DATABASE_URL is set). Append-only `events` table.
 *   FileStore - one JSON file (server/data/events.json by default), so `npm start` works with no database.
 * Both expose the same methods:
 *   init(makeSeed) -> { pilotStart, events, applied, seeded }   migrate, seed if empty, load everything
 *   append(event)                                                write one event durably
 *   reset(seed)                                                  replace the whole log with a fresh seed
 *   health(), close()
 * The server calls these one at a time (it serializes actions), so the stores need no locking of their own.
 */
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');
const MIGRATION_LOCK = 7262026; // pg_advisory_xact_lock key: one server at a time runs migrations/seeding

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------------- PostgreSQL ---------------- */

function describeUrl(url) {
  try {
    const u = new URL(url);
    return u.hostname + (u.port ? ':' + u.port : '') + u.pathname; // never log the password
  } catch (e) {
    return '(DATABASE_URL could not be parsed)';
  }
}

function listMigrations() {
  return fs.readdirSync(MIGRATIONS_DIR).filter((f) => /^\d+_[\w-]+\.sql$/.test(f)).sort();
}

// One round trip for any number of events; WITH ORDINALITY keeps their order, so `seq` follows it.
async function insertEvents(client, events) {
  if (!events.length) return;
  await client.query(
    `INSERT INTO events (id, type, at, payload)
     SELECT e->>'id', e->>'type', (e->>'at')::bigint, e
     FROM jsonb_array_elements($1::jsonb) WITH ORDINALITY AS t(e, n)
     ORDER BY n`,
    [JSON.stringify(events)]
  );
}

async function writeSeed(client, seed) {
  await client.query(
    `INSERT INTO meta (key, value) VALUES ('pilotStart', $1::jsonb)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [JSON.stringify(seed.pilotStart)]
  );
  await insertEvents(client, seed.events);
}

class PgStore {
  constructor(url) {
    const { Pool } = require('pg');
    this.name = 'postgres';
    this.where = describeUrl(url);
    this.pool = new Pool({ connectionString: url, max: 5, connectionTimeoutMillis: 10000, idleTimeoutMillis: 30000 });
    // Managed databases close idle connections (Neon suspends when idle). Log it; the pool reconnects.
    this.pool.on('error', (err) => console.warn('[db] idle connection closed: ' + err.message));
  }

  // Run fn(client) inside BEGIN/COMMIT; roll back on any error.
  async tx(fn) {
    const client = await this.pool.connect();
    let failed;
    try {
      await client.query('BEGIN');
      const out = await fn(client);
      await client.query('COMMIT');
      return out;
    } catch (err) {
      failed = err;
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release(failed); // a connection that errored is discarded, not reused
    }
  }

  // The database may still be starting (e.g. on first deploy); retry the first connection briefly.
  async waitForDb(tries = 6, delayMs = 2000) {
    for (let i = 1; ; i++) {
      try {
        await this.pool.query('SELECT 1');
        return;
      } catch (err) {
        if (i >= tries) throw new Error('could not connect to PostgreSQL at ' + this.where + ': ' + err.message);
        console.warn(`[db] not reachable yet (${err.message}); retrying in ${delayMs / 1000}s`);
        await sleep(delayMs);
      }
    }
  }

  async init(makeSeed) {
    await this.waitForDb();
    // Migrations and the first seed run in ONE transaction under a transaction-scoped advisory lock:
    // two servers starting at once cannot both migrate or both seed, and a failure leaves nothing half-done.
    const { applied, seeded } = await this.tx(async (c) => {
      await c.query(`SELECT pg_advisory_xact_lock(${MIGRATION_LOCK})`);
      await c.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
        name       text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )`);
      const done = new Set((await c.query('SELECT name FROM schema_migrations')).rows.map((r) => r.name));
      const applied = [];
      for (const file of listMigrations()) {
        if (done.has(file)) continue;
        try {
          await c.query(fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8'));
        } catch (err) {
          err.message = 'migration ' + file + ' failed: ' + err.message;
          throw err;
        }
        await c.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
        applied.push(file);
      }
      let seeded = 0;
      const { rows } = await c.query('SELECT EXISTS (SELECT 1 FROM events) AS has');
      if (!rows[0].has) {
        const seed = makeSeed();
        await writeSeed(c, seed);
        seeded = seed.events.length;
      }
      return { applied, seeded };
    });
    const loaded = await this.load();
    return Object.assign(loaded, { applied, seeded });
  }

  async load() {
    const meta = await this.pool.query("SELECT value FROM meta WHERE key = 'pilotStart'");
    const events = (await this.pool.query('SELECT payload FROM events ORDER BY seq')).rows.map((r) => r.payload);
    let pilotStart = meta.rows.length ? Number(meta.rows[0].value) : NaN;
    if (!Number.isFinite(pilotStart)) {
      throw new Error("meta table has no valid 'pilotStart' row. Restore it or reset the database.");
    }
    return { pilotStart, events };
  }

  async append(event) {
    await this.tx((c) =>
      c.query('INSERT INTO events (id, type, at, payload) VALUES ($1, $2, $3, $4::jsonb)', [
        event.id,
        event.type,
        event.at,
        JSON.stringify(event),
      ])
    );
  }

  async reset(seed) {
    // TRUNCATE (not DELETE) so the append-only trigger stays strict for everything else.
    await this.tx(async (c) => {
      await c.query('TRUNCATE events');
      await writeSeed(c, seed);
    });
  }

  async health() {
    await this.pool.query('SELECT 1');
  }

  async close() {
    await this.pool.end();
  }
}

/* ---------------- JSON file ---------------- */

class FileStore {
  constructor(file) {
    this.name = 'file';
    this.file = file;
    this.where = file;
    this.doc = null;
  }

  async init(makeSeed) {
    let doc = null;
    try {
      doc = JSON.parse(await fsp.readFile(this.file, 'utf8'));
    } catch (err) {
      if (err.code !== 'ENOENT') {
        throw new Error('could not read ' + this.file + ': ' + err.message + '. Fix the file, or delete it to start a fresh demo.');
      }
    }
    if (doc !== null && (!doc || typeof doc.pilotStart !== 'number' || !Array.isArray(doc.events))) {
      throw new Error(this.file + ' is not a FoodLink event file. Delete it to start a fresh demo.');
    }
    let seeded = 0;
    if (!doc || !doc.events.length) {
      const seed = makeSeed();
      doc = { pilotStart: seed.pilotStart, events: seed.events.slice() };
      await this.write(doc);
      seeded = doc.events.length;
    }
    this.doc = doc;
    return { pilotStart: doc.pilotStart, events: doc.events.slice(), applied: [], seeded };
  }

  async append(event) {
    this.doc.events.push(event);
    try {
      await this.write(this.doc);
    } catch (err) {
      this.doc.events.pop();
      throw err;
    }
  }

  async reset(seed) {
    const doc = { pilotStart: seed.pilotStart, events: seed.events.slice() };
    await this.write(doc);
    this.doc = doc;
  }

  // Write to a temp file, flush it to disk, then rename over the old file: a crash never leaves half a file.
  // One event per line so the file is easy to read and diff.
  async write(doc) {
    await fsp.mkdir(path.dirname(this.file), { recursive: true });
    const text = '{"pilotStart":' + JSON.stringify(doc.pilotStart) + ',"events":[\n' +
      doc.events.map((e) => JSON.stringify(e)).join(',\n') + '\n]}\n';
    const tmp = this.file + '.tmp';
    const fh = await fsp.open(tmp, 'w');
    try {
      await fh.writeFile(text);
      await fh.sync();
    } finally {
      await fh.close();
    }
    await fsp.rename(tmp, this.file);
  }

  async health() {}

  async close() {}
}

function createStore({ databaseUrl, dataFile }) {
  return databaseUrl ? new PgStore(databaseUrl) : new FileStore(dataFile);
}

module.exports = { createStore, PgStore, FileStore, listMigrations };
