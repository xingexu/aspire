# FoodLink

FoodLink is a free-food finder and pilot tracker for Western University students, built for the USC case
competition. Students see live stock at two self-serve shelves on campus (UCC Point and Weldon Point), tap
"shelf empty" when something runs out, and reserve sealed surplus food that campus partners post, using
an anonymous pickup code (FL-1234) instead of a name. Volunteers log each restock against a food-safety
checklist. Partners post drops and confirm pickups. The USC sees the impact numbers (items taken, waste,
time to restock an empty shelf, surplus rescued) update live. The data starts with a clearly labelled
simulated six-week pilot, and everything people do in the app is added on top of it.

This folder holds the full app: the browser UI, the shared domain logic, and a Node.js server that keeps
the data in PostgreSQL (or in a JSON file when no database is configured).

---

## How it works

```
 Browser (phone, laptop)                            Server (node server/server.js)
 ┌──────────────────────────────┐                   ┌────────────────────────────────────────┐
 │ ui.js      the screens       │  GET /api/state   │ event log + folded state, in memory    │
 │ domain.js  (same file)   ◄───┼───────────────────┤ domain.js  (same file)                 │
 │ state = fold(events)         │                   │                                        │
 │                              │  POST /api/actions│ 1. check PIN, rate limit               │
 │ "Shelf empty?" ──────────────┼──────────────────►│ 2. domain builds + validates the event │
 │                              │                   │ 3. INSERT inside a transaction         │
 │ EventSource ◄────────────────┼───────────────────┤ 4. apply in memory                     │
 │                              │  GET /api/stream  │ 5. push to every open page (SSE)       │
 └──────────────────────────────┘                   └───────────────────┬────────────────────┘
                                                                        │
                                              PostgreSQL: events (append-only) + meta
```

**One domain module, used twice.** `src/domain.js` holds every business rule: what a valid restock is,
the food-safety rules for surplus drops (sealed, labelled, chilled food kept cold, a best-before date for
shelf-stable food, short pickup windows for perishables), reservation codes, and how the impact numbers are
calculated. It is pure JavaScript with no I/O. The browser runs it to draw the screens and to check forms as
you type. The server runs the same file to validate every action before anything is saved, so a modified
browser cannot save something the rules forbid.

**State is an event log.** Nothing like "UCC has 14 cans of protein" is ever stored. What is stored is what
happened: `restock`, `report` (shelf empty), `drop_post`, `reserve`, `pickup`, each with a time. Current state
(shelf counts, open reports, live drops, every number on the impact page) is computed by folding the log
with `domain.fold(events)`. Folding the ~500-event pilot takes about 1 ms, so the server rebuilds its state
from the database on every start.

**The `events` table is the audit trail.** Every restock, empty-shelf report, surplus drop, reservation and
pickup is one row. A database trigger blocks `UPDATE` and `DELETE` on it, so rows can be added but not
edited. The only way to clear it is the admin reset (below), which uses `TRUNCATE`. Anyone checking the
pilot's numbers can recompute them from the raw rows.

**Writes happen one at a time.** The server handles actions through a queue, in order. Each event is written
to Postgres inside a transaction before it is applied in memory or sent to anyone. If the write fails,
nothing changes and the client gets a 500. Because of the queue, two students cannot reserve the last item
at the same moment (this is tested with 12 simultaneous reservations for 4 items).

**Live updates use Server-Sent Events.** Every open page keeps one `GET /api/stream` connection. New events
are pushed as they are saved; a reset tells pages to reload their data. If a phone loses its connection, the
browser reconnects on its own and the server sends what it missed (standard `Last-Event-ID`).

**Roles are PINs, not accounts.** Students never log in. Volunteers (restock) and partners (drops, pickups)
enter a shared PIN for their role, and an admin PIN allows reset. A role with no PIN set is open, which is
handy for a demo (the server prints a warning at startup).

### Files

```
src/domain.js        shared business rules (browser + server). Unit tests: test/domain.test.js
src/ui.js            browser UI (works standalone, or against the API when window.FOODLINK_API is set)
src/head.html, src/styles.css
build.js             writes server/public/index.html (API mode) and dist/foodlink.html (standalone demo)
server/server.js     HTTP server: static files, API, SSE, PINs, rate limits, security headers
server/store.js      PostgreSQL store (with a small migration runner) and the JSON-file fallback
server/migrations/   SQL migrations, applied once each, in order (001_init.sql)
test/                domain, server and browser tests (see Tests)
```

---

## Run it locally

You need **Node.js 20 or newer**.

### Without a database (quickest)

```
npm install
npm start
```

Open http://localhost:3000 (the presenter view is http://localhost:3000/#present). With no `DATABASE_URL`, the server keeps the log in `server/data/events.json`
(created on first start, ignored by git). Delete that file to start the demo over, or use **Reset demo** in
the Live demo view.

### With PostgreSQL

Any current PostgreSQL works. It was tested with 16; the schema needs 11 or newer, and the test suite needs
13 or newer. Create an empty database and point `DATABASE_URL` at it. The server creates the tables on first
start (migrations), seeds the simulated pilot once, and reuses the data after.

macOS / Linux:

```
createdb foodlink
DATABASE_URL=postgres://localhost/foodlink npm start
```

Windows (PowerShell):

```
$env:DATABASE_URL = "postgres://postgres:yourpassword@localhost:5432/foodlink"; npm start
```

With Docker (not tested here, as this environment had no Docker):

```
docker run --name foodlink-db -e POSTGRES_PASSWORD=foodlink -p 5432:5432 -d postgres:16
DATABASE_URL=postgres://postgres:foodlink@localhost:5432/postgres npm start
```

The first lines of output say which store is active, which migrations ran, and whether the log was
seeded. For example:

```
FoodLink server
  store:      PostgreSQL (localhost:5432/foodlink)
  migrations: applied 001_init.sql
  events:     504 loaded (log was empty: seeded the simulated pilot)
  clock:      America/Toronto
  WARNING: VOLUNTEER_PIN is not set, so anyone can log restocks (demo mode).
  ...
FoodLink listening on http://localhost:3000
```

### Turning the PINs on

```
VOLUNTEER_PIN=… PARTNER_PIN=… ADMIN_PIN=… npm start
```

When a PIN is needed, the page shows a PIN field after the first try. The PIN is kept in the browser's
session storage until the tab closes. Reset asks for the admin PIN in a prompt and does not store it.

---

## Configuration

All settings are environment variables. All are optional.

| Variable | Default | What it does |
|---|---|---|
| `DATABASE_URL` | (none) | PostgreSQL connection string. If unset, the JSON file store is used. |
| `DATA_FILE` | `server/data/events.json` | Where the file store keeps the log. |
| `PORT` | `3000` | Port to listen on. Hosts like Render and Railway set this for you. |
| `HOST` | all interfaces | Set `127.0.0.1` to accept local connections only. |
| `VOLUNTEER_PIN` | (open) | Needed to log a restock. |
| `PARTNER_PIN` | (open) | Needed to post a surplus drop and to confirm a pickup. |
| `ADMIN_PIN` | (open) | Needed to reset the demo (this deletes the whole event log). |
| `RATE_LIMIT_PER_MIN` | `30` | Reports + reservations allowed per device (IP) per minute. `0` turns it off. |
| `AUTH_FAIL_LIMIT_PER_MIN` | `10` | Wrong PINs allowed per device per minute before it is locked out for the rest of that minute. |
| `TRUST_PROXY` | `0` | Set `1` when running behind one proxy (Render, Railway). The client IP is then read from `X-Forwarded-For`. Leave `0` otherwise, or anyone could fake their IP. |
| `TZ` | `America/Toronto` | Time zone used to lay out the simulated pilot (opening hours, days). |
| `SSE_HEARTBEAT_MS` | `25000` | How often an idle stream gets a keep-alive comment, in ms. |

PINs can be any ASCII text. Use long random ones for anything public. Wrong guesses are rate limited per
device, but a 4-digit PIN is still easy to share and guess.

---

## API reference

All responses are JSON unless noted. Errors look like `{"ok": false, "errors": ["Readable message."]}`.

### `GET /api/state`

The whole event log, in order (sorted by `at`, then by write order).

```json
{ "pilotStart": 1790222400000, "events": [ { "id": "rs_s1", "type": "restock", "at": 1790253900000, "...": "..." } ] }
```

`at` and `pilotStart` are milliseconds since 1970. The browser folds `events` with `domain.fold` to get state.

### `GET /api/stream` (Server-Sent Events)

```
retry: 3000

id: 9f2c4be1a07d.rp_k3x9q1          ← on connect, if the client is up to date: "you are here"

id: 9f2c4be1a07d.rp_8d02mz          ← one message per new event; data is the event JSON
event: ev
data: {"id":"rp_8d02mz","type":"report","at":1793434641557,"pointId":"ucc","cat":"protein"}

event: reset                        ← the log was reset (or the client is out of date): fetch /api/state again
data: {"pilotStart":1790222400000}

: heartbeat                         ← every 25 s, keeps proxies from closing an idle stream
```

Catch-up: a client says what it already has with the `Last-Event-ID` header (browsers send it on reconnect)
or `?lastEventId=<event id>` on the first connect. The server replays the events after that one, or sends
`reset` if that event is not in the current log. The id has two parts, `<log token>.<event id>`. The log token
changes on every reset and restart, so a page that slept through a reset is told to reload rather than
quietly keeping old data.

### `POST /api/actions`

Body: `{"action": "...", "input": {...}}` with `Content-Type: application/json`, 32 KB at most. Send the role
PIN, when needed, in the `x-foodlink-pin` header. The server stamps the event with its own clock.

| action | who | input |
|---|---|---|
| `report` | anyone (rate limited) | `{"pointId": "ucc", "cat": "protein"}` |
| `reserve` | anyone (rate limited) | `{"dropId": "d_x7k2pq"}` → the event carries the pickup `code` |
| `restock` | `VOLUNTEER_PIN` | `{"pointId", "counts": {"<cat>": {"before", "added", "removed"}} for all six categories, "checklist": {"sealed": true, "dated": true, "shelfStable": true}}` |
| `drop` | `PARTNER_PIN` | `{"partner", "title", "kind": "shelf" \| "chilled" \| "prepared", "qty", "place", "windowMin", "sealed", "labelled", "cold", "bestBefore": "YYYY-MM-DD"}` |
| `pickup` | `PARTNER_PIN` | `{"code": "FL-1234"}` |

Points are `ucc` and `weldon`. Categories are `grains`, `protein`, `breakfast`, `sauces`, `snacks` and
`hygiene`.

| status | meaning |
|---|---|
| 200 | `{"ok": true, "event": {...}, "warnings": [...]}`. Saved, applied and sent to every open page. `warnings` (restock only) are things worth a second look that do not block saving. |
| 400 | `{"ok": false, "errors": [...]}`. Failed validation (the messages come from the domain rules), or a malformed request. |
| 401 | PIN missing or wrong for this action. |
| 413 / 415 | Body over 32 KB / not JSON. |
| 429 | Too many requests or wrong PINs from this device. See the `Retry-After` header. |
| 500 | The save failed (for example, the database is down). Nothing was changed. |

### `POST /api/reset`

Needs `ADMIN_PIN` if set. Deletes every event, reseeds the simulated pilot for today, and sends `reset` to
every open page. Returns `{"ok": true, "pilotStart", "events": <count>}`.

### `GET /api/health`

`{"ok": true, "store": "postgres", "events": 512, "streams": 3, "uptimeSec": 3600}`, or 503 if the database
cannot be reached. Use it as the host's health check.

Static routes: `/` (the app) and `/domain.js` (the shared module).

---

## Deploy (Node host + managed PostgreSQL)

> **Not tested here.** The steps below follow each provider's usual setup, but no deployment to Render,
> Railway, Neon or Supabase was made or tested while building this. Everything was tested locally against a
> real PostgreSQL 16 server. Do a trial deploy well before the presentation.

Things that apply on any host:

- **Use PostgreSQL there.** Host file systems are usually wiped on every deploy or restart, so the JSON file
  store would lose data.
- **Run exactly one instance.** Each server keeps the log in memory and pushes updates to its own
  connections. Two instances would not see each other's events.
- Set `TRUST_PROXY=1`, so rate limits apply per student and not to the host's proxy as a whole.
- Set the three PINs.
- Free tiers usually sleep when idle, and the first visit can then take up to a minute. Open the site a few
  minutes before you present.

### Render (web service) + Neon (PostgreSQL)

1. Push this folder to a GitHub repository. `node_modules` and `server/data` are already in `.gitignore`.
2. **Neon:** create a project and copy its connection string. It looks like
   `postgresql://user:password@ep-....neon.tech/neondb?sslmode=require`.
   node-postgres treats `sslmode=require` as full certificate checking, and prints a warning saying so.
   Change it to `sslmode=verify-full` to get the same behaviour without the warning.
3. **Render:** New → Web Service → pick the repository.
   - Runtime: Node. Build command: `npm ci`. Start command: `npm start`.
   - Environment: `DATABASE_URL` (the Neon string), `VOLUNTEER_PIN`, `PARTNER_PIN`, `ADMIN_PIN`,
     `TRUST_PROXY=1`.
   - Health check path: `/api/health`.
4. Deploy, then check the log. It should show `store: PostgreSQL (...)`, `migrations: applied 001_init.sql`
   and `seeded the simulated pilot`. Later deploys reuse the same data.

### Railway (alternative)

1. New project → Deploy from GitHub repo. Add a PostgreSQL database to the same project.
2. In the web service's variables, set `DATABASE_URL` to the database's URL (Railway can reference it, for
   example `${{Postgres.DATABASE_URL}}`), and set the PINs and `TRUST_PROXY=1`.
3. Railway runs `npm start` and sets `PORT`. Generate a public domain in the service's networking settings.

### Supabase as the database

Use the connection string from the project's **Connect** page. Prefer the session pooler or the direct
connection. If the host has no IPv6, the direct connection may not work, so use the session pooler. If the
server logs a certificate error (for example, "self-signed certificate in certificate chain"), download the
project's CA certificate from Supabase and add `sslrootcert=/path/to/ca.crt` to `DATABASE_URL`. Render can
mount a file like that as a Secret File under `/etc/secrets/`.

---

## Privacy

- **No student identity is collected or stored.** No names, student numbers, emails or accounts. An
  empty-shelf report is a Point, a category and a time. A reservation is a random code (`FL-1234`), the drop
  it is for, and a time. The student's own codes stay in their browser (`localStorage`).
- **Volunteers are not identified either.** The log records what was counted and when, not who counted it.
  That keeps things simple and private, but accountability rests only on who knows the PIN.
- **Partner details are stored**: the partner's organization name, what the food is, and where to pick it up.
- **IP addresses** are held in memory for a minute or two, only for rate limiting. They are never written to
  the database or to the server's own logs. The hosting provider may keep its own access logs.
- **Fonts come from Google Fonts**, so a visitor's browser contacts Google (`Referrer-Policy: no-referrer`
  stops it sending the page address). To avoid this, self-host the three fonts and drop the Google
  links from `src/head.html` and the CSP.
- **Reset deletes the whole log.** Keep `ADMIN_PIN` secret during a real pilot.

## Security, in brief

- PINs are compared in constant time (SHA-256 digests with `timingSafeEqual`). Wrong guesses are counted per
  device, and a device is locked out after 10 in a minute.
- Every input is cleaned before it reaches the domain module: only known Points, categories, drop kinds and
  drop ids are accepted. Names like `__proto__` are rejected. Each event is also test-applied to a copy of
  the state before it is saved, so the log only ever holds events that can be replayed.
- `Content-Security-Policy`: scripts are allowed only from this site, plus the page's two inline scripts by
  SHA-256 hash (computed at startup). Styles allow inline styles (the UI uses `style` attributes) and Google
  Fonts. Framing is blocked (`frame-ancestors 'none'`). Also sent: `X-Content-Type-Options: nosniff` and
  `Referrer-Policy: no-referrer`.
- Actions only accept `application/json`, so another website cannot submit them with a plain HTML form. No
  CORS headers are sent, so other sites' scripts cannot call the API either.
- 32 KB request limit. Per-device rate limits on the public actions.

---

## Tests

```
npm test            # domain unit tests + server tests
npm run test:ui     # browser test of the standalone demo (needs Playwright)
```

Results when this was built (Linux, PostgreSQL 16): domain **12/12**, server **15/15**, UI **60/60** on Node
22. `npm test` also passed on Node 20 and Node 24.

**`test/domain.test.js` (12 tests)** covers the business rules: seed consistency, restock validation and the
checklist, items-taken accounting, merging and resolving empty-shelf reports, drop food-safety rules,
reservation limits and windows, pickup codes, forecasts, and daylight-saving changes.

**`test/server.test.js` (15 tests)** starts a real, throwaway PostgreSQL server: `initdb` into a temp
folder, `postgres` on a free port, all deleted afterwards. It then runs `node server/server.js` as a child
process against it and checks:

- the migration runs once, the pilot is seeded once, and `GET /api/state` has the right shape, order and row count
- the page, `/domain.js`, CSP hashes that match the inline scripts, `nosniff`, `no-referrer`, 404/405
- each action, valid and invalid: restock, report, drop, reserve, pickup. This includes `__proto__`-style
  ids, food-safety rejections, "All claimed", "Already picked up", and each row landing in Postgres
- 401 for a missing PIN, a wrong PIN, and the wrong role's PIN
- 12 simultaneous reservations for 4 items: exactly 4 succeed, with unique codes, and the log stays in order
- bad JSON, wrong content type, unknown action, and the 32 KB limit (413)
- SSE: a posted event reaches a subscriber, heartbeats, catch-up with `?lastEventId=` and `Last-Event-ID`,
  and `reset` for an unknown or older-log id
- the table is append-only: `UPDATE` and `DELETE` are refused, and unknown event types are refused
- reset needs the admin PIN, reseeds Postgres and emits `reset`
- persistence: stop the server (SIGTERM, clean exit), start it again, get the same log, with no reseed and no re-migration
- a browser test (Playwright, served page in API mode): a student reports an empty shelf on one page; a
  second page gets it live over SSE; the row is in Postgres; a restock asks for the volunteer PIN and then
  saves; reset prompts for the admin PIN; each page keeps exactly one stream open; no console or CSP errors
- database outage: the database is dropped under a running server; the action gets 500; nothing is applied
  or broadcast; health returns 503
- rate limits (429 and `Retry-After`), the wrong-PIN lockout, and `X-Forwarded-For` honoured only with `TRUST_PROXY`
- file-store mode with no `DATABASE_URL`: open-gate warnings, file on disk, survives a restart, reset

How the test finds PostgreSQL: `PG_BIN` if set, then `/usr/lib/postgresql/<version>/bin` (Debian/Ubuntu),
then `pg_config --bindir`, then `PATH` (Homebrew). With no PostgreSQL installed, the Postgres tests are
skipped with a message, and the file-store and rate-limit tests still run. PostgreSQL refuses to run as
root. When the tests run as root (for example in a container), the cluster runs as the `postgres` system
user, or `nobody`, through Node's `spawn` `uid`/`gid` options, in a folder under `/tmp`. Set `PG_TEST_USER`
to choose another account. The browser test runs only if Playwright and its Chromium are installed (a
global install is found automatically); otherwise it is skipped.

`npm run test:ui` checks the standalone demo (`dist/foodlink.html`) at desktop and phone sizes, in light
and dark mode, including presenter mode and live sync between tabs. It needs Playwright with Chromium,
installed in the project or globally. With a global install, run `NODE_PATH=$(npm root -g) npm run test:ui`.
It serves Google Fonts from cached copies in `test/fonts/*.bin`. Those files are not committed, so the
script first downloads any that are missing (4 small files listed in `test/fonts/urls.txt`). Offline, the
test still runs, and its five "no console errors" checks fail because of the font 404s.

**Not tested:**

- any real deployment (Render, Railway, Neon, Supabase), or TLS to a managed database
- real reverse proxies (`TRUST_PROXY` was only tested with a hand-set header)
- browsers other than Chromium, and phones putting the page to sleep in the background
- load or performance beyond the concurrency test above
- the test helper on macOS or Windows (it was run on Linux, as root and as a regular user)

## Known limits

- One server instance only (see Deploy).
- `GET /api/state` sends the whole log: about 100 KB for the seeded pilot, uncompressed. That is fine for a
  pilot. At tens of thousands of events it would need snapshots or paging.
- PINs are per role and shared, not per person.
