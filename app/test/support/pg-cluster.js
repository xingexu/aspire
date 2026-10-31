'use strict';
/*
 * A throwaway PostgreSQL cluster for the server tests: initdb into a temp folder, start `postgres` on a free
 * port (127.0.0.1 only, trust auth, fsync off), and delete everything afterwards. No Docker needed.
 *
 * Finding PostgreSQL: $PG_BIN, then /usr/lib/postgresql/<newest>/bin (Debian/Ubuntu), then `pg_config --bindir`,
 * then $PATH (Homebrew, Postgres.app if added to PATH).
 *
 * PostgreSQL refuses to run as root. When the tests run as root (containers, CI), the cluster runs as an
 * unprivileged account instead: $PG_TEST_USER, else the `postgres` system user, else `nobody`. Node's
 * spawn() uid/gid options switch user, so no sudo/su is needed. The temp folder is then made under /tmp
 * (not a private TMPDIR) so that account can reach it, and handed over with chown.
 */
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const EXE = process.platform === 'win32' ? '.exe' : '';

function findPgBin() {
  const dirs = [];
  if (process.env.PG_BIN) dirs.push(process.env.PG_BIN);
  try {
    const base = '/usr/lib/postgresql';
    fs.readdirSync(base).filter((v) => /^\d+$/.test(v)).sort((a, b) => b - a).forEach((v) => dirs.push(path.join(base, v, 'bin')));
  } catch (e) { /* not Debian/Ubuntu */ }
  try {
    const r = spawnSync('pg_config', ['--bindir'], { encoding: 'utf8' });
    if (r.status === 0 && r.stdout.trim()) dirs.push(r.stdout.trim());
  } catch (e) { /* no pg_config */ }
  (process.env.PATH || '').split(path.delimiter).filter(Boolean).forEach((d) => dirs.push(d));
  return dirs.find((d) => fs.existsSync(path.join(d, 'initdb' + EXE)) && fs.existsSync(path.join(d, 'postgres' + EXE))) || null;
}

function unprivilegedUser() {
  for (const name of [process.env.PG_TEST_USER, 'postgres', 'nobody'].filter(Boolean)) {
    const u = spawnSync('id', ['-u', name], { encoding: 'utf8' });
    const g = spawnSync('id', ['-g', name], { encoding: 'utf8' });
    if (u.status === 0 && g.status === 0) return { name, uid: Number(u.stdout.trim()), gid: Number(g.stdout.trim()) };
  }
  return null;
}

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

async function startCluster(bin) {
  const { Client } = require('pg');
  const asRoot = typeof process.getuid === 'function' && process.getuid() === 0;
  const user = asRoot ? unprivilegedUser() : null;
  if (asRoot && !user) throw new Error('running as root, and no unprivileged account (postgres/nobody) to run PostgreSQL. Set PG_TEST_USER.');
  const dir = fs.mkdtempSync(path.join(asRoot ? '/tmp' : os.tmpdir(), 'foodlink-pg-'));
  const as = user ? { uid: user.uid, gid: user.gid } : {};
  if (user) fs.chownSync(dir, user.uid, user.gid);
  const data = path.join(dir, 'data');
  const env = Object.assign({}, process.env, { LC_ALL: 'C', LANG: 'C' });
  const opts = Object.assign({ cwd: dir, env }, as);
  let proc = null;
  const cleanup = () => {
    if (proc && proc.exitCode === null && proc.signalCode === null) { try { proc.kill('SIGKILL'); } catch (e) { /* gone */ } }
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* best effort */ }
  };
  process.on('exit', cleanup); // if the test run dies, do not leave a server or a folder behind

  const init = spawnSync(path.join(bin, 'initdb' + EXE),
    ['-D', data, '-U', 'foodlink', '--auth=trust', '-E', 'UTF8', '--locale=C', '--no-sync', '--no-instructions'],
    Object.assign({ encoding: 'utf8' }, opts));
  if (init.status !== 0) {
    cleanup();
    throw new Error('initdb failed (' + (init.error ? init.error.message : 'exit ' + init.status) + '):\n' + (init.stderr || ''));
  }

  const port = await freePort();
  let log = '';
  proc = spawn(path.join(bin, 'postgres' + EXE),
    ['-D', data, '-h', '127.0.0.1', '-p', String(port), '-k', dir,
      '-c', 'fsync=off', '-c', 'synchronous_commit=off', '-c', 'full_page_writes=off', '-c', 'max_connections=60'],
    Object.assign({ stdio: ['ignore', 'pipe', 'pipe'] }, opts));
  proc.stdout.on('data', (d) => { log += d; });
  proc.stderr.on('data', (d) => { log += d; });

  const url = (db) => 'postgres://foodlink@127.0.0.1:' + port + '/' + db;
  const deadline = Date.now() + 30000;
  for (;;) {
    if (proc.exitCode !== null) { cleanup(); throw new Error('postgres exited during startup:\n' + log); }
    const c = new Client({ connectionString: url('postgres') });
    try {
      await c.connect();
      await c.end();
      break;
    } catch (err) {
      await c.end().catch(() => {});
      if (Date.now() > deadline) { cleanup(); throw new Error('postgres did not accept connections: ' + err.message + '\n' + log); }
      await sleep(150);
    }
  }

  return {
    port,
    dir,
    runAs: user ? user.name : os.userInfo().username,
    url,
    log: () => log,
    async createDatabase(name) {
      const c = new Client({ connectionString: url('postgres') });
      await c.connect();
      try { await c.query('CREATE DATABASE "' + name.replace(/"/g, '') + '"'); } finally { await c.end(); }
      return url(name);
    },
    async stop() {
      if (proc.exitCode === null && proc.signalCode === null) {
        const exited = new Promise((r) => proc.once('exit', r));
        proc.kill('SIGINT'); // "fast" shutdown
        const t = setTimeout(() => { try { proc.kill('SIGKILL'); } catch (e) { /* gone */ } }, 10000);
        await exited;
        clearTimeout(t);
      }
      cleanup();
      process.removeListener('exit', cleanup);
    },
  };
}

module.exports = { findPgBin, startCluster };
