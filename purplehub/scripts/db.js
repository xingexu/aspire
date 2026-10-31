'use strict';
// Starts Purple Hub's own PostgreSQL, kept in purplehub/.pgdata and reachable only from this computer. Creates it on first run.
// Skipped when DATABASE_URL is set, because then you're using a database of your own.
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const PORT = 5544;
const DEFAULT_DIR = path.join(__dirname, '..', '.pgdata');
const urlFor = (port) => 'postgres://purplehub@127.0.0.1:' + port + '/purplehub';

function run(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (r.error && r.error.code === 'ENOENT') throw new Error(cmd + ' wasn’t found. Install PostgreSQL first: brew install postgresql@14');
  return r;
}
function binDir() {
  const r = spawnSync('pg_config', ['--bindir'], { encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() + path.sep : '';
}
function start(dir = DEFAULT_DIR, port = PORT) {
  const bin = binDir();
  if (!fs.existsSync(path.join(dir, 'PG_VERSION'))) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    // Trust is safe here only because the server below listens on 127.0.0.1 alone, with no socket file.
    const init = run(bin + 'initdb', ['-D', dir, '-U', 'purplehub', '--auth=trust', '-E', 'UTF8', '--locale=C', '--no-instructions']);
    if (init.status !== 0) throw new Error('Could not create the database folder:\n' + init.stderr);
  }
  if (run(bin + 'pg_ctl', ['-D', dir, 'status']).status === 0) return urlFor(port);
  const up = run(bin + 'pg_ctl', ['-D', dir, '-w', '-l', path.join(dir, 'server.log'), '-o', "-h 127.0.0.1 -p " + port + " -c unix_socket_directories=''", 'start']);
  if (up.status !== 0) throw new Error('Could not start PostgreSQL:\n' + up.stderr + up.stdout);
  return urlFor(port);
}
function stop(dir = DEFAULT_DIR) { return run(binDir() + 'pg_ctl', ['-D', dir, '-m', 'fast', '-w', 'stop']); }

module.exports = { start, stop, urlFor };
