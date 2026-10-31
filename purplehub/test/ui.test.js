// End-to-end checks for the Purple Hub page. Run: node test/ui.test.js [--shots]
'use strict';
const { chromium, webkit, devices } = require('playwright');
const http = require('http');
const os = require('os');
const { spawn } = require('child_process');
const { Client } = require('pg');
const pgdb = require('../scripts/db');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SHOTS = process.argv.includes('--shots');
const SHOT_DIR = path.join(ROOT, 'test', 'shots');
if (SHOTS) fs.mkdirSync(SHOT_DIR, { recursive: true });

// A real server on a throwaway PostgreSQL cluster, so every check runs against the actual database.
const PG_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'purplehub-test-'));
const DB_URL = pgdb.start(PG_DIR, 5577);
function startServer(port, extra) {
  return new Promise((resolve, reject) => {
    const env = { ...process.env, PORT: String(port), DATABASE_URL: DB_URL, OPENAI_API_KEY: '', AUTH_TRIES: '100000', ...extra };
    const proc = spawn(process.execPath, ['server/app.js'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'inherit'] });
    process.on('exit', () => proc.kill());
    proc.stdout.on('data', (d) => { if (/listening on/.test(d)) resolve(proc); });
    proc.on('exit', (c) => reject(new Error('server exited ' + c)));
  });
}
const stopServer = (proc) => new Promise((resolve) => { proc.removeAllListeners('exit'); proc.on('exit', resolve); proc.kill(); });
const DEMO = 'purplehub-demo';
const H = { 'x-purplehub': '1' };
// Signs a browser context in through the real API, so its cookie is real.
async function signIn(ctx, base, email) {
  const r = await ctx.request.post(base + 'api/login', { headers: H, data: { email, password: DEMO } });
  if (!r.ok()) throw new Error('login failed for ' + email);
}
let BASE = '';
const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: !!ok });
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok || detail === undefined ? '' : ' :: ' + String(JSON.stringify(detail)).slice(0, 300)));
}
async function noOverflow(page, label) {
  const o = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
  check('no horizontal scroll: ' + label, o.sw <= o.iw, o);
}
// Every context counts as a returning visitor unless firstVisit is set, so the walkthrough only opens where a test wants it.
async function newPage(browser, opts) {
  const { firstVisit, as, base: b, ...ctxOpts } = opts || {};
  const ctx = await browser.newContext(Object.assign({ viewport: { width: 1440, height: 900 } }, ctxOpts));
  if (!firstVisit) await ctx.addInitScript(() => { try { localStorage.setItem('purplehub-tour-seen-v1', '1'); } catch (e) { /* blocked */ } });
  if (as) await signIn(ctx, BASE, as);
  // The event list is real dates, so the tests pin today's date and don't expire.
  await ctx.clock.setFixedTime(new Date(2026, 9, 31, 12));
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/status of 40[0-9]|upgrade-insecure/.test(m.text())) errors.push('console: ' + m.text()); });
  return { ctx, page, errors };
}
async function shot(page, name) { if (SHOTS) await page.screenshot({ path: path.join(SHOT_DIR, name + '.png'), fullPage: true }); }
const VIEWS = ['week', 'messages', 'clubs', 'usc', 'profile'];
const ENGINES = [['chromium', chromium], ['webkit', webkit]];
// Phones in both orientations, tablets, then Mac windows from a small MacBook to a Studio Display.
const SIZES = [[320, 568], [375, 667], [390, 844], [430, 932], [844, 390], [768, 1024], [1024, 768], [1199, 800], [1200, 800], [1280, 800], [1512, 982], [1920, 1080], [2560, 1440]];
const TOUR_STEPS = 7;
const pick = async (page, id, v) => { await page.click('[data-testid="' + id + '"]'); await page.click('[data-testid="' + id + '-opt-' + v + '"]'); };
const ADMIN = 'usc.demo@uwo.ca';
const PHONE_BAR_MAX = 1199;
(async () => {
  let server = await startServer(3977);
  const base = BASE = 'http://127.0.0.1:3977/';
  const browser = await chromium.launch();

  /* ---------- home: real events, search and sorting ---------- */
  {
    const { ctx, page, errors } = await newPage(browser);
    await page.goto(base);
    await page.waitForSelector('[data-testid="feed"] .poster');
    const feed = page.locator('[data-testid="feed"] .poster');
    check('title is Purple Hub', (await page.title()) === 'Purple Hub');
    check('home: has Happening today and Upcoming events', /Happening today/.test(await page.locator('#view-week').innerText()) && /Upcoming events/.test(await page.locator('#view-week').innerText()));
    const today = page.locator('[data-testid="today"] .poster');
    check('today: the badge says Today, and ASPIRE is at the UCC', /Today/.test(await today.innerText()) && /\bUCC\b/.test(await today.innerText()));
    check('today: ASPIRE is in Happening today and nowhere else', (await today.count()) === 1 && /ASPIRE/.test(await today.innerText()) && !/ASPIRE/.test(await page.locator('[data-testid="feed"]').innerText()) && !/ASPIRE/.test(await page.locator('[data-testid="recent"]').innerText()));
    check('home: lists the 4 real upcoming events', (await feed.count()) === 4);
    const shots = await page.locator('[data-testid="feed"] .poster-shot').evaluateAll((im) => im.map((i) => i.naturalWidth));
    check('home: every event shows its Instagram screenshot', shots.length === 4 && shots.every((w) => w > 300), shots);
    check('home: every event links to its post', (await page.locator('[data-testid="feed"] .post-link[href^="https://www.instagram.com/p/"]').count()) === 4);
    check('home: past events include all the imported clubs', (await page.locator('[data-testid="recent"] .past-card').count()) === 8 && /Succ Sale/.test(await page.locator('[data-testid="recent"]').innerText()) && /CAISA/.test(await page.locator('[data-testid="recent"]').innerText()));
    check('home: brand says by USC', (await page.locator('.brand-by').innerText()) === 'by USC');
    const text = await page.locator('body').innerText();
    for (const gone of ['Help', 'I’m here', 'Pitch in', 'Prototype for', 'Door code', 'Make it count', 'a PD USC program', 'Why it', 'My record'])
      check('removed: ' + gone, !text.includes(gone));
    check('removed: icons on the page', (await page.locator('header svg, #view-week svg, footer svg').count()) === 0);
    check('tabs: Home and Messages have icons', (await page.locator('.tabs a[href="#week"] svg').count()) === 1 && (await page.locator('.tabs a[href="#messages"] svg').count()) === 1);
    check('dropdowns: none are the browser’s', (await page.locator('select').count()) === 0);
    await page.fill('[data-testid="search"]', 'figma nope');
    check('search: no match says so', /No upcoming events match/.test(await page.locator('[data-testid="feed"]').innerText()));
    await page.fill('[data-testid="search"]', 'sprint');
    check('search: finds a specific event and keeps the cursor', (await feed.count()) === 1 && /Innovation Sprint/.test(await feed.innerText()) && await page.evaluate(() => document.activeElement.id === 'ev-search'));
    await page.fill('[data-testid="search"]', '');
    await pick(page, 'sort-club', 'wfn');
    check('sort by club: shows only that club', (await feed.count()) === 2 && (await page.locator('[data-testid="recent"] .past-card').count()) === 0);
    await pick(page, 'sort-club', 'csa');
    check('CSA: lists its AGM and Ignition', /CSA Annual General Meeting/.test(await feed.first().innerText()) && await page.locator('[data-testid="past-ignition"]').isVisible() && /Sept 16/.test(await page.locator('[data-testid="past-ignition"]').innerText()));
    await pick(page, 'sort-club', 'All');
    await pick(page, 'sort-cat', 'Competitions');
    check('category: narrows the list', (await feed.count()) === 2 && (await today.count()) === 1);
    await page.click('[data-testid="sort-cat"]');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('Escape');
    check('dropdown: Escape closes it', await page.locator('#sort-cat .dd-menu').isHidden());
    await page.click('[data-testid="sort-club"]');
    await page.click('h2:has-text("Upcoming events")');
    check('dropdown: clicking away closes it', await page.locator('#sort-club .dd-menu').isHidden());
    await pick(page, 'sort-cat', 'All');
    const tabs = await page.locator('.tabs a:not([hidden])').evaluateAll((a) => a.map((x) => x.getAttribute('href')));
    check('tabs: anyone gets Home and Messages', tabs.join() === '#week,#messages', tabs);
    check('home: no errors', errors.length === 0, errors);
    await ctx.close();
  }
  {
    const { ctx, page } = await newPage(browser);
    await ctx.clock.setFixedTime(new Date(2026, 10, 6, 12));
    await page.goto(base);
    await page.waitForSelector('[data-testid="feed"]');
    const ids = await page.locator('[data-testid="feed"] .poster').evaluateAll((els) => els.map((e) => e.dataset.testid));
    check('events: finished ones move to Past events', ids.join() === 'event-sprint,event-fullstack' && await page.locator('[data-testid="past-design"]').isVisible(), ids);
    await ctx.close();
  }

  /* ---------- neutral at rest, purple only on hover; translucent boxes over the photo ---------- */
  for (const scheme of ['light', 'dark']) {
    const { ctx, page } = await newPage(browser, { colorScheme: scheme, as: ADMIN });
    const off = [], opaque = [], named = [];
    for (const v of VIEWS) {
      await page.goto(base + '#' + v);
      await page.waitForSelector('#view-' + v + ':not([hidden])');
      await page.waitForTimeout(340);
      await page.mouse.move(0, 0);
      const r = await page.evaluate((view) => {
        const hue = (str) => {
          const m = str.match(/rgba?\(([\d.]+)[, ]+([\d.]+)[, ]+([\d.]+)(?:[,/ ]+([\d.]+))?/);
          if (!m) return null;
          const [r, g, b] = [m[1], m[2], m[3]].map((n) => Number(n) / 255), a = m[4] === undefined ? 1 : Number(m[4]);
          const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
          if (a < 0.05 || d < 0.08) return null;
          const h = max === r ? 60 * (((g - b) / d) % 6) : max === g ? 60 * ((b - r) / d + 2) : 60 * ((r - g) / d + 4);
          return (h + 360) % 360;
        };
        const off = [], opaque = [];
        document.querySelectorAll('body, body *').forEach((el) => {
          if (el.closest('svg, script, style, [hidden]') || el.tagName === 'BR') return;
          const cs = getComputedStyle(el);
          if (el.closest('.unread, .today-badge, .funded-tag')) return; // the new-message and On today badges are purple accents
          [cs.backgroundColor, cs.color].forEach((c) => { const h = hue(c); if (h !== null && h >= 235 && h <= 345) off.push(view + ' ' + el.tagName + '.' + el.className + ' ' + c); });
        });
        document.querySelectorAll('#view-' + view + ' :is(.panel,.poster,.kpi)').forEach((el) => {
          const c = getComputedStyle(el).backgroundColor, a = c.match(/,\s*([\d.]+)\)|\/\s*([\d.]+)\)/);
          if (!a && c !== 'rgba(0, 0, 0, 0)') opaque.push(view + ' ' + el.className + ' ' + c);
        });
        return { off, opaque, text: document.body.innerText };
      }, v);
      off.push(...r.off); opaque.push(...r.opaque);
      if (/\bcounts\b/i.test(r.text)) named.push(v + ': ' + r.text.match(/.{0,30}\bcounts\b.{0,20}/i)[0]);
    }
    check('colour: no purple at rest on any page, system ' + scheme, off.length === 0, off.slice(0, 6));
    check('boxes: every text box is translucent, system ' + scheme, opaque.length === 0, opaque.slice(0, 6));
    check('name: the word counts appears on no page', named.length === 0, named);
    const bg = await page.evaluate(() => { const a = getComputedStyle(document.querySelector('.aurora')); return { img: a.backgroundImage.startsWith('url("data:image/jpeg'), op: Number(a.opacity), body: getComputedStyle(document.body).backgroundColor }; });
    check('background: the Western photo, faded, system ' + scheme, bg.img && bg.op > 0 && bg.op < 1 && bg.body === 'rgb(245, 245, 247)', bg);
    await ctx.close();
  }
  {
    const { ctx, page } = await newPage(browser);
    await page.goto(base + '#week');
    const poster = page.locator('[data-testid="event-fullstack"]');
    await poster.hover();
    await page.waitForTimeout(450);
    check('colour: containers highlight purple on hover', /rgb\(79, 38, 131\)/.test(await poster.evaluate((e) => getComputedStyle(e).boxShadow)));
    const dark = await page.evaluate(() => [...document.querySelectorAll('.btn:not(.ghost)')].filter((b) => !b.closest('[hidden]')).filter((b) => { const m = getComputedStyle(b).backgroundColor.match(/[\d.]+/g).map(Number); return m[0] < 60 && m[1] < 60 && m[2] < 60; }).length);
    check('buttons: none are solid black', dark === 0, dark);
    await page.mouse.move(0, 0);
    await page.click('.tabs a[href="#messages"]');
    await page.waitForSelector('[data-testid="gate-messages"]');
    const f = await page.evaluate(() => ({ moving: document.querySelector('#tab-glider').getAnimations().length > 0, ghost: !!document.querySelector('.view-ghost'), live: document.querySelectorAll('.view-ghost [id], .view-ghost [data-testid], .view-ghost [data-act]').length, anims: document.querySelector('#view-messages').getAnimations().length }));
    check('fade: pages cross-fade and the tab highlight glides', f.ghost && f.anims > 0 && f.moving, f);
    check('fade: the outgoing copy has no live controls', f.live === 0, f);
    await page.waitForTimeout(520);
    const glide = await page.evaluate(() => { const g = document.querySelector('#tab-glider').getBoundingClientRect(), a = document.querySelector('.tabs a[aria-current="page"]').getBoundingClientRect(); return Math.abs(g.left - a.left) + Math.abs(g.width - a.width); });
    check('fade: the highlight lands on the current tab, and the copy is cleaned up', glide < 2 && (await page.locator('.view-ghost').count()) === 0, glide);
    await ctx.close();
  }

  /* ---------- accounts, in PostgreSQL ---------- */
  {
    const { ctx, page, errors } = await newPage(browser);
    await page.goto(base + '#usc');
    check('login: dashboard is locked when signed out', await page.locator('[data-testid="gate-admin"]').isVisible() && (await page.locator('[data-testid="kpi-open"]').count()) === 0);
    await page.goto(base + '#messages');
    check('login: messages ask you to sign in', await page.locator('[data-testid="gate-messages"]').isVisible());
    await page.click('[data-testid="gate-messages"] [data-v="up"]');
    await page.fill('#lg-name', 'Test Student');
    await page.fill('#lg-email', 'someone@gmail.com');
    await page.fill('#lg-pass', 'a-good-password');
    await page.click('[data-testid="login-submit"]');
    const errShows = (text) => page.waitForFunction((x) => document.querySelector('#lg-err').textContent.includes(x), text);
    await errShows('ending in @uwo.ca');
    check('signup: a non-Western email is refused', true);
    await page.fill('#lg-email', 'teststudent@uwo.ca');
    await page.fill('#lg-pass', 'short');
    await page.click('[data-testid="login-submit"]');
    await errShows('at least 8');
    check('signup: a short password is refused', true);
    check('signup: warns against reusing the Western password', /not your Western one/.test(await page.locator('#lg-hint').innerText()));
    await page.fill('#lg-pass', 'a-good-password');
    await page.click('[data-testid="login-submit"]');
    await page.waitForFunction(() => document.querySelector('[data-testid="account"]').textContent === 'Test');
    check('signup: a student gets an account straight away', true);
    await page.reload();
    await page.waitForFunction(() => document.querySelector('[data-testid="account"]').textContent === 'Test');
    check('login: stays signed in after a refresh', true);
    await page.click('[data-testid="account"]');
    await page.click('[data-testid="signout"]');
    await page.waitForFunction(() => document.querySelector('[data-testid="account"]').textContent === 'Sign in');
    await page.click('[data-testid="account"]');
    check('shared accounts: the sign-in screen shows the password', (await page.locator('[data-testid="demo-password"]').innerText()) === DEMO);
    await page.fill('#lg-email', 'teststudent@uwo.ca');
    await page.fill('#lg-pass', 'wrong-password');
    await page.click('[data-testid="login-submit"]');
    await errShows('isn’t right');
    check('login: a wrong password is refused', true);
    await page.fill('#lg-pass', 'a-good-password');
    await page.click('[data-testid="login-submit"]');
    await page.waitForFunction(() => document.querySelector('[data-testid="account"]').textContent === 'Test');
    check('login: the right password works', true);
    await page.click('[data-testid="account"]');
    const menu = await page.locator('[data-testid="account-menu"]').boundingBox();
    check('account: pressing your name opens a menu at the top right, with Sign out', menu.x + menu.width > 1000 && menu.y < 200 && await page.locator('[data-testid="signout"]').isVisible(), menu);
    await page.click('[data-testid="signout"]');
    await page.waitForFunction(() => document.querySelector('[data-testid="account"]').textContent === 'Sign in');
    check('account: Sign out works', true);
    await page.click('[data-testid="account"]');
    const quick = await page.locator('[data-testid="demo-usc"]').boundingBox(), box = await page.locator('#lg-email').boundingBox();
    check('shared accounts: the buttons come before the email box', quick.y < box.y);
    await page.click('[data-testid="demo-usc"]');
    await page.waitForSelector('[data-testid="kpi-open"]');
    check('shared accounts: one press signs you in', true);
    await page.click('[data-testid="account"]');
    await page.click('[data-testid="signout"]');
    await page.waitForFunction(() => document.querySelector('[data-testid="account"]').textContent === 'Sign in');
    check('login: no errors', errors.length === 0, errors);
    await ctx.close();

    const pg = new Client({ connectionString: DB_URL });
    await pg.connect();
    const row = (await pg.query("SELECT password_hash FROM users WHERE email = 'teststudent@uwo.ca'")).rows[0];
    check('database: the account is in PostgreSQL, with the password hashed', !!row && !row.password_hash.includes('a-good-password') && row.password_hash.length > 100);
    await pg.end();
    await stopServer(server);
    server = await startServer(3977);
    const after = await browser.newContext();
    const again = await after.request.post(base + 'api/login', { headers: H, data: { email: 'teststudent@uwo.ca', password: 'a-good-password' } });
    check('database: accounts survive a server restart', again.ok());
    await after.close();
  }
  {
    const anon = await browser.newContext();
    const post = (c, url, data, headers = H) => c.request.post(base + url, { headers, data });
    check('security: requests without the site header are refused', (await post(anon, 'api/login', { email: ADMIN, password: DEMO }, {})).status() === 403);
    const staff = await post(anon, 'api/signup', { name: 'X', email: 'staff@uwo.ca', password: 'a-good-password', role: 'admin' });
    check('accounts: USC staff can sign up with no code', staff.ok());
    await post(anon, 'api/logout', {});
    check('security: an email can only register once', (await post(anon, 'api/signup', { name: 'X', email: ADMIN, password: 'a-good-password', role: 'student' })).status() === 409);
    check('security: posting needs an account', (await post(anon, 'api/posts', {})).status() === 403);
    const student = await browser.newContext(); await signIn(student, base, 'nuo.demo@uwo.ca');
    check('security: a student can’t approve posts', (await post(student, 'api/posts/1/review', { status: 'approved' })).status() === 403);
    check('security: a student can’t post', (await post(student, 'api/posts', {})).status() === 403);
    const other = await browser.newContext(); await signIn(other, base, 'zohra.demo@uwo.ca');
    const nuoThread = (await (await student.request.get(base + 'api/data')).json()).threads[0].id;
    check('security: nobody can post into someone else’s chat', (await post(other, 'api/messages', { thread: nuoThread, body: 'hi' })).status() === 403);
    check('security: nobody can read someone else’s chat', !(await (await other.request.get(base + 'api/data')).json()).threads.some((x) => x.id === nuoThread));
    const pres = await browser.newContext();
    await post(pres, 'api/signup', { name: 'New Pres', email: 'newpres@uwo.ca', password: 'a-good-password', role: 'club', club: 'wfn' });
    const presData = await (await pres.request.get(base + 'api/data')).json();
    check('accounts: a new president can use their club right away', presData.user.approved === true && presData.threads.length > 0);
    const early = await post(pres, 'api/posts', { title: 'From a new president', date: 'Soon', place: 'UCC', ends: Date.now() + 86400000 * 3, post: 'https://www.instagram.com/p/NEWPRES1/', cat: 'Social' });
    check('accounts: and their post reaches the USC', early.ok());
    const adminView = await browser.newContext(); await signIn(adminView, base, ADMIN);
    const seen = (await (await adminView.request.get(base + 'api/data')).json()).requests.find((p) => p.title === 'From a new president');
    check('database: a post from one person shows up on the USC’s side', !!seen && seen.status === 'pending');
    const quick = await post(pres, 'api/funding', { event: 'Lazy', items: [{ what: 'Food', cost: 100 }], attendance: 10, purpose: 'x', neededBy: '2036-01-01' });
    check('funding: a thin application is refused by the server too', quick.status() === 400);
    await adminView.close();
    await Promise.all([anon.close(), student.close(), other.close(), pres.close()]);
  }

  /* ---------- post, approval and funding, in both engines ---------- */
  for (const [name, engine] of ENGINES) {
    const b = await engine.launch();
    const { ctx, page, errors } = await newPage(b, { as: 'wfn.demo@uwo.ca' });
    await ctx.route('https://www.instagram.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: 'post' }));
    await page.goto(base + '#clubs');
    await page.waitForSelector('[data-testid="chat-open"]');
    await page.click('[data-testid="chat-open"]');
    const log = page.locator('#chat-log');
    const send = async (v) => { await page.fill('#chat-input', v); await page.click('[data-testid="chat-send"]'); };
    const title = 'Demo night ' + name;
    await send('nope');
    check('post ' + name + ': refuses a link that isn’t Instagram', /doesn’t look like a post link/.test(await log.innerText()));
    await send('https://www.instagram.com/p/ABC123xyz/?igsh=tracking');
    await send('<img src=x onerror="window.hacked=1">' + title);
    await send('Friday, Nov 13, 6 p.m.');
    await send('UCC, room 56');
    await send('2026-01-01');
    check('post ' + name + ': refuses a date in the past', /already passed/.test(await log.innerText()));
    await send('2036-11-13');
    await page.click('[data-testid="chat-opt-Social"]');
    await page.setInputFiles('[data-testid="chat-file"]', path.join(ROOT, 'assets', 'events', 'design.jpg'));
    await page.click('[data-testid="chat-request"]');
    await page.waitForFunction(() => /Sent to the USC/.test(document.querySelector('#chat-log').innerText));
    await page.click('#dlg-chat [data-close]');
    const mine = page.locator('[data-testid^="mine-"]', { hasText: title });
    check('post ' + name + ': the president sees it waiting', /Waiting for USC approval/.test(await mine.innerText()));
    await page.goto(base + '#week');
    await page.reload();
    await page.waitForSelector('[data-testid="feed"]');
    check('post ' + name + ': nothing is public before approval', (await page.locator('[data-testid="feed"] .poster', { hasText: title }).count()) === 0);
    const adm = await newPage(b, { as: ADMIN });
    await adm.page.goto(base + '#usc');
    const req = adm.page.locator('[data-testid^="request-"]', { hasText: title });
    await req.waitFor();
    await req.locator('[data-testid^="decline-post-"]').click();
    check('usc ' + name + ': declining needs a reason', /short note/.test(await adm.page.locator('#toast').innerText()));
    await req.locator('[data-testid^="approve-post-"]').click();
    await req.waitFor({ state: 'hidden' });
    check('usc ' + name + ': approving takes it off the list', true);

    // Funding: four steps for the president, approve or decline for the USC.
    await page.goto(base + '#clubs');
    await page.click('[data-testid="fund-start"]');
    const ferr = () => page.locator('#fund-err').innerText();
    const next = () => page.click('[data-testid="fund-next"]');
    const fill = (k, v) => page.fill('[data-testid="fund-' + k + '"]', v);
    await page.click('[data-testid="fund-event"]');
    await page.click('[data-testid="fund-event-opt-__other"]');
    await next();
    check('fund ' + name + ': step 1 needs an event', /name the event/.test(await ferr()));
    const evName = 'Big night ' + name;
    await fill('other', evName);
    await next();
    check('fund ' + name + ': step 1 needs a date', /date of the event/.test(await ferr()));
    await fill('eventDate', '2036-11-01');
    await fill('location', 'UCC 56');
    await next();
    await next();
    check('fund ' + name + ': step 2 needs an item', /at least one item/.test(await ferr()));
    await page.fill('[data-testid="item-what-0"]', 'Food');
    await page.fill('[data-testid="item-cost-0"]', '$150');
    await page.click('[data-testid="fund-add"]');
    check('fund ' + name + ': keeps what you typed when adding a line', (await page.inputValue('[data-testid="item-what-0"]')) === 'Food');
    await page.fill('[data-testid="item-what-1"]', 'Room');
    await page.fill('[data-testid="item-cost-1"]', '100');
    await fill('otherClub', '300');
    await next();
    check('fund ' + name + ': refuses if other funding covers it all', /nothing to request/.test(await ferr()));
    await fill('otherClub', '50');
    check('fund ' + name + ': works out what you’re asking for', (await page.locator('[data-testid="fund-total"]').innerText()) === '$250' && (await page.locator('[data-testid="fund-ask"]').innerText()) === '$200');
    await next();
    await fill('purpose', 'Too short');
    await next();
    check('fund ' + name + ': a one-line reason isn’t enough', /at least 40/.test(await ferr()));
    await fill('purpose', 'To feed everyone at a welcoming event for new students');
    await fill('benefit', 'New students meet clubs they would not find otherwise');
    await fill('attendance', '50');
    await fill('nonMembers', '60');
    await next();
    check('fund ' + name + ': non-members can’t exceed attendance', /no more than/.test(await ferr()));
    await fill('nonMembers', '30');
    await fill('measure', 'Sign-in sheet');
    await next();
    await fill('treasurer', 'Pat Treasurer');
    await fill('neededBy', '2036-10-20');
    await fill('signature', 'Pat President');
    await next();
    check('fund ' + name + ': step 4 needs all three agreements', /all three conditions/.test(await ferr()));
    await page.check('[data-testid="fund-agreeReceipts"]');
    await page.check('[data-testid="fund-agreeUnspent"]');
    await page.check('[data-testid="fund-agreeTrue"]');
    await next();
    check('fund ' + name + ': the review shows it all', /To feed everyone/.test(await page.locator('#fund-body').innerText()) && (await page.locator('#fund-body [data-testid="fund-ask"]').innerText()) === '$200');
    await page.click('[data-testid="fund-back"]');
    check('fund ' + name + ': Back keeps your answers', (await page.inputValue('[data-testid="fund-signature"]')) === 'Pat President' && await page.isChecked('[data-testid="fund-agreeTrue"]'));
    await next();
    await next();
    const myFund = page.locator('[data-testid^="myfund-"]', { hasText: evName });
    await myFund.waitFor();
    check('fund ' + name + ': the president sees it waiting', /Waiting for USC/.test(await myFund.innerText()));
    const fcard = adm.page.locator('[data-testid^="funding-"]', { hasText: evName });
    await fcard.waitFor();
    check('usc ' + name + ': sees the whole application', /Food/.test(await fcard.innerText()) && /30 non-members/.test(await fcard.innerText()) && /Pat Treasurer/.test(await fcard.innerText()) && /Other funding/.test(await fcard.innerText()));
    await fcard.locator('[data-testid^="approve-funding-"]').click();
    check('usc ' + name + ': approving needs a note', /add a note/.test(await adm.page.locator('#toast').innerText()));
    await fcard.locator('[data-testid^="note-funding-"]').fill('Approved for food only, please split the room');
    await fcard.locator('[data-testid^="approve-funding-"]').click();
    check('usc ' + name + ': approving needs the checklist', /review checklist/.test(await adm.page.locator('#toast').innerText()));
    for (const box of await fcard.locator('.review-checks input').all()) await box.check();
    await fcard.locator('[data-testid^="amount-"]').fill('150');
    await fcard.locator('[data-testid^="approve-funding-"]').click();
    await page.waitForFunction(() => /approved your funding/.test(document.querySelector('#toast').innerText));
    check('fund ' + name + ': the USC can approve part of it, and the president sees that with the note', /\$150 of \$200/.test(await myFund.innerText()) && /split the room/.test(await myFund.innerText()));
    await adm.ctx.close();
    await page.goto(base + '#week');
    const card = page.locator('[data-testid="feed"] .poster', { hasText: title });
    await card.waitFor();
    check('post ' + name + ': appears on Home right away once approved, with a clean link', (await card.locator('.post-link').getAttribute('href')) === 'https://www.instagram.com/p/ABC123xyz/');
    check('post ' + name + ': typed text can’t run as code', !(await page.evaluate(() => window.hacked)) && /<img src=x/.test(await card.innerText()));
    check('post ' + name + ': no errors', errors.length === 0, errors);
    await ctx.close();
    await b.close();
  }

  /* ---------- USC funded tag and Management ---------- */
  {
    const v = await newPage(browser);
    await v.page.goto(base);
    await v.page.waitForSelector('[data-testid="event-design"]');
    check('funded: no tag before the USC approves', (await v.page.locator('[data-testid="funded-design"]').count()) === 0);
    const m = await newPage(browser, { as: ADMIN });
    await m.page.goto(base + '#usc');
    await m.page.waitForSelector('[data-testid="kpi-open"]');
    check('management: the tab, page and button all say Management', /Management/.test(await m.page.locator('.tabs a[href="#usc"]').innerText()) && (await m.page.locator('#view-usc h1').innerText()) === 'Management' && (await m.page.locator('[data-testid="account"]').innerText()) === 'Management');
    await m.page.click('[data-testid="account"]');
    await m.page.click('[data-testid="view-profile"]');
    await m.page.waitForSelector('[data-testid="profile-name"]');
    check('profile: View profile opens from the top right, with their details', /usc\.demo@uwo\.ca/.test(await m.page.locator('#view-profile').innerText()) && await m.page.locator('[data-testid="account-menu"]').isHidden());
    await m.page.click('.tabs a[href="#usc"]');
    await m.page.waitForSelector('[data-testid="kpi-open"]');
    check('management: the tab has an icon', (await m.page.locator('.tabs a[href="#usc"] svg').count()) === 1);
    const card = m.page.locator('[data-testid^="funding-"]', { hasText: 'Design & Defend' });
    for (const box of await card.locator('.review-checks input').all()) await box.check();
    await card.locator('[data-testid^="note-funding-"]').fill('Approved');
    await card.locator('[data-testid^="approve-funding-"]').click();
    await m.page.waitForFunction(() => /Funding approved/.test(document.querySelector('#toast').innerText));
    await v.page.reload();
    await v.page.waitForSelector('[data-testid="funded-design"]');
    check('funded: the tag shows for a signed-out viewer once approved', (await v.page.locator('[data-testid="funded-design"]').innerText()) === 'USC funded');
    const pub = await (await v.ctx.request.get(base + 'api/data')).text();
    check('funded: amounts and applications stay private', !/approvedAmount|"amount"/.test(pub));
    check('funded: other events have no tag', (await v.page.locator('[data-testid="funded-sprint"]').count()) === 0);
    await Promise.all([v.ctx.close(), m.ctx.close()]);
  }

  /* ---------- messaging: sample chats, delivery and unread counts ---------- */
  {
    const s = await newPage(browser, { as: 'ahana.demo@uwo.ca' });
    await s.page.goto(base + '#messages');
    await s.page.waitForSelector('[data-testid="msg-log"]');
    check('messages: sample chat is there, with its reply', /Everyone’s welcome/.test(await s.page.locator('[data-testid="msg-log"]').innerText()));
    for (const [email, text] of [['zinger.demo@uwo.ca', 'How would my club get funding'], ['nuo.demo@uwo.ca', 'Design & Defend okay'], ['zohra.demo@uwo.ca', 'another case competition']]) {
      const c = await browser.newContext(); await signIn(c, base, email);
      check('messages: sample chat for ' + email.split('.')[0], JSON.stringify((await (await c.request.get(base + 'api/data')).json()).threads).includes(text));
      await c.close();
    }
    // The president has their page open on Home; the reply must reach them with no refresh.
    const p = await newPage(browser, { as: 'csa.demo@uwo.ca' });
    await p.page.goto(base);
    await p.page.waitForFunction(() => document.querySelector('[data-testid="account"]').textContent === 'CSA');
    await p.page.waitForTimeout(300);
    await s.page.fill('[data-testid="msg-input"]', '<b>Is the bubble tea free?</b>');
    await s.page.click('[data-testid="msg-send"]');
    await s.page.waitForFunction(() => /bubble tea free/.test(document.querySelector('[data-testid="msg-log"]').innerText));
    check('messages: text shows as plain text', /<b>Is the bubble tea free\?<\/b>/.test(await s.page.locator('[data-testid="msg-log"]').innerText()));
    await p.page.waitForSelector('[data-testid="msg-badge"]:not([hidden])');
    check('receive: the president gets a number on Messages with no refresh', /^\d/.test(await p.page.locator('[data-testid="msg-badge"]').innerText()));
    check('receive: and a notice saying who it’s from', /New message from Ahana Gehlot/.test(await p.page.locator('#toast').innerText()));
    await p.page.click('.tabs a[href="#messages"]');
    await p.page.click('[data-testid="inbox-list"] button:has-text("Ahana")');
    await p.page.waitForSelector('[data-testid="msg-badge"][hidden]', { state: 'attached' });
    check('receive: opening the chat clears the number', true);
    await p.page.fill('[data-testid="msg-input"]', 'Yes, for the first 50 members');
    await p.page.click('[data-testid="msg-send"]');
    await s.page.waitForFunction(() => /first 50 members/.test(document.querySelector('[data-testid="msg-log"]').innerText));
    check('receive: the reply reaches the student live', true);
    await p.page.reload();
    await p.page.waitForFunction(() => document.querySelector('[data-testid="msg-badge"]').hidden);
    check('receive: read chats stay read after a refresh', true);
    await pick(s.page, 'new-chat', 'usc');
    check('messages: can start a new chat with the USC', /University Students’ Council/.test(await s.page.locator('.thread-head').innerText()));
    await s.page.fill('[data-testid="msg-input"]', 'Hello USC');
    await s.page.click('[data-testid="msg-send"]');
    await s.page.waitForSelector('[data-testid="inbox-list"] button:has-text("USC")');
    const admin = await newPage(browser, { as: ADMIN });
    await admin.page.goto(base + '#messages');
    await admin.page.waitForSelector('[data-testid="inbox-list"] button:has-text("Ahana")');
    check('receive: USC staff see it in their inbox', true);
    check('messages: no errors', s.errors.length + p.errors.length + admin.errors.length === 0, s.errors.concat(p.errors, admin.errors));
    await Promise.all([s.ctx.close(), p.ctx.close(), admin.ctx.close()]);
    const phone = await newPage(browser, { as: 'nuo.demo@uwo.ca', viewport: { width: 390, height: 844 } });
    await phone.page.goto(base + '#messages');
    await phone.page.waitForSelector('[data-testid="inbox-list"] button');
    check('phone: messages open on the list', await phone.page.locator('[data-testid="inbox-list"]').isVisible() && !(await phone.page.locator('.msg-app .thread').isVisible()));
    await phone.page.click('[data-testid="inbox-list"] button');
    check('phone: tapping a chat opens it, with a way back', await phone.page.locator('[data-testid="msg-log"]').isVisible() && !(await phone.page.locator('[data-testid="inbox-list"]').isVisible()));
    check('phone: the assistant button stays off the Send button', await phone.page.locator('[data-testid="ask-fab"]').isHidden());
    await phone.page.click('[data-testid="thread-back"]');
    check('phone: Back returns to the list', await phone.page.locator('[data-testid="inbox-list"]').isVisible());
    await phone.ctx.close();
  }

  /* ---------- the assistant ---------- */
  {
    const { ctx, page, errors } = await newPage(browser);
    await page.goto(base);
    const fab = await page.locator('[data-testid="ask-fab"]').boundingBox();
    check('assistant: is a chat bubble, not a text button', (await page.locator('[data-testid="ask-fab"] svg').count()) === 1 && (await page.locator('[data-testid="ask-fab"]').innerText()).trim() === '');
    check('assistant: sits in the bottom-right corner', fab.x + fab.width > 1440 - 40 && fab.y + fab.height > 900 - 40, fab);
    await page.click('[data-testid="ask-fab"]');
    const box = await page.locator('[data-testid="ask-panel"]').boundingBox();
    check('assistant: opens from that corner, leaving the page usable', box.x > 900 && box.y + box.height > 900 - 40, box);
    const log = page.locator('[data-testid="ask-log"]');
    const ask = async (q) => { const n = await log.locator('.chat-msg').count(); await page.fill('[data-testid="ask-input"]', q); await page.click('[data-testid="ask-send"]'); await page.waitForFunction((c) => document.querySelectorAll('#ask-log .chat-msg:not(.typing)').length >= c + 2 && !document.querySelector('#ask-log .typing'), n); return log.locator('.chat-msg').last().innerText(); };
    check('assistant: answers hi like a person', /^Hi!/.test(await ask('hi')));
    check('assistant: suggestions clear once you start', (await page.locator('[data-testid^="ask-q-"]').count()) === 0);
    check('assistant: knows when the CSA AGM is', /Nov 2.*Somerville/.test(await ask('when is the csa agm?')));
    check('assistant: knows about Ignition', /Sept 16/.test(await ask('tell me about ignition')));
    check('assistant: explains funding', /Request funding/.test(await ask('how do I get funding for my club')));
    check('assistant: admits what it doesn’t know', /not sure/.test(await ask('is parking free')));
    await page.click('[data-testid="ask-close"]');
    check('assistant: closes', await page.locator('[data-testid="ask-panel"]').isHidden() && await page.locator('[data-testid="ask-fab"]').isVisible());
    check('assistant: no errors', errors.length === 0, errors);
    await ctx.close();
    // GPT: a stand-in for OpenAI, to see exactly what's sent and that its answer is used.
    let seen = null, fail = false;
    const stub = http.createServer((req, res) => {
      let d = ''; req.on('data', (c) => { d += c; }); req.on('end', () => {
        seen = { auth: req.headers.authorization, url: req.url, body: JSON.parse(d) };
        if (fail) { res.writeHead(500); return res.end('{}'); }
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ choices: [{ message: { content: 'Answer from GPT' } }] }));
      });
    });
    await new Promise((r) => stub.listen(3978, '127.0.0.1', r));
    const gpt = await startServer(3979, { OPENAI_API_KEY: 'test-key', OPENAI_BASE_URL: 'http://127.0.0.1:3978/v1' });
    const c = await browser.newContext();
    const chat = async () => (await (await c.request.post('http://127.0.0.1:3979/api/chat', { headers: H, data: { messages: [{ role: 'user', content: 'Earlier question' }, { role: 'assistant', content: 'Earlier answer' }, { role: 'user', content: 'when is ignition?' }] } })).json());
    const r = await chat();
    check('gpt: the model’s answer is used', r.reply === 'Answer from GPT' && r.source === 'gpt', r);
    check('gpt: the key goes only in the server’s request', seen.auth === 'Bearer test-key' && seen.url === '/v1/chat/completions');
    check('gpt: it’s given the real events, and told not to invent', /Ignition 2026.*Sept 16/.test(seen.body.messages[0].content) && /Never invent/.test(seen.body.messages[0].content));
    check('gpt: it remembers the conversation', seen.body.messages.length === 4);
    fail = true;
    const r2 = await chat();
    check('gpt: if the model fails, the built-in answers take over', r2.source === 'builtin' && /Sept 16/.test(r2.reply), r2);
    const page2 = await c.newPage();
    await page2.goto('http://127.0.0.1:3979/');
    check('gpt: the key never reaches the browser', !(await page2.content()).includes('test-key'));
    await c.close();
    await stopServer(gpt);
    stub.close();
  }

  /* ---------- logo ---------- */
  {
    const { ctx, page } = await newPage(browser);
    await page.goto(base);
    const logo = await page.evaluate(async () => {
      const el = document.querySelector('[data-testid="usc-logo"]'), r = el.getBoundingClientRect();
      const url = getComputedStyle(el).backgroundImage.match(/url\("(.*)"\)/)[1];
      const img = new Image(); img.src = url; await img.decode();
      return { w: r.width, h: r.height, natural: img.naturalWidth, foot: !!document.querySelector('footer .usc-logo') };
    });
    check('logo: in the header and footer, and it decodes', logo.w >= 32 && logo.w === logo.h && logo.natural === 320 && logo.foot, logo);
    await ctx.close();
  }

  /* ---------- walkthrough: first visit only, and usable on every kind of screen ---------- */
  const tourRuns = [
    ['Mac Chrome', chromium, { viewport: { width: 1440, height: 900 } }],
    ['Mac Safari', webkit, { viewport: { width: 1440, height: 900 } }],
    ['Studio Display', chromium, { viewport: { width: 2560, height: 1440 } }],
    ['iPhone 15', webkit, devices['iPhone 15']],
    ['iPhone SE', webkit, { ...devices['iPhone SE'], viewport: { width: 320, height: 568 } }],
    ['iPhone landscape', webkit, devices['iPhone 15 landscape']],
  ];
  for (const [tag, engine, opts] of tourRuns) {
    const b = await engine.launch();
    // Reduced motion turns the spotlight's slide off, so these measure where things land.
    const { ctx, page, errors } = await newPage(b, { ...opts, firstVisit: true, reducedMotion: 'reduce' });
    await page.goto(base);
    await page.waitForSelector('[data-testid="tour"][open]');
    check('tour ' + tag + ': opens by itself on the first visit', /Step 1 of 7/.test(await page.locator('[data-testid="tour-count"]').innerText()));
    const problems = [];
    const vw = page.viewportSize().width;
    for (let i = 0; i < TOUR_STEPS; i++) {
      await page.waitForTimeout(40);
      const st = await page.evaluate(() => {
        const box = (s) => { const r = document.querySelector(s).getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom }; };
        return { card: box('[data-testid="tour-card"]'), spot: box('[data-testid="tour-spot"]'), off: document.querySelector('[data-testid="tour-spot"]').classList.contains('off'), text: document.querySelector('[data-testid="tour-text"]').textContent, vw: innerWidth, vh: innerHeight, sw: document.documentElement.scrollWidth };
      });
      const label = 'step ' + (i + 1);
      if (st.card.l < 0 || st.card.r > st.vw + 0.5 || st.card.t < 0 || st.card.b > st.vh + 0.5) problems.push(label + ' card off screen ' + JSON.stringify(st.card));
      if (st.text.length < 30) problems.push(label + ' has no explanation');
      if (st.sw > st.vw) problems.push(label + ' sideways scroll');
      if (i !== 0 && st.off) problems.push(label + ' spotlight is off');
      if (i !== 0 && !st.off && (st.spot.b < 0 || st.spot.t > st.vh)) problems.push(label + ' spotlight off screen');
      if (i !== 0 && !st.off && st.card.l < st.spot.r - 0.5 && st.card.r > st.spot.l + 0.5 && st.card.t < st.spot.b - 0.5 && st.card.b > st.spot.t + 0.5) problems.push(label + ' card covers the spotlight');
      if (i === 1 && !(vw <= PHONE_BAR_MAX ? /bottom/ : /top/).test(st.text)) problems.push('nav step names the wrong screen edge: ' + st.text);
      await page.click('[data-testid="tour-next"]');
    }
    check('tour ' + tag + ': all 7 steps fit the screen and point at the right thing', problems.length === 0, problems);
    check('tour ' + tag + ': finishes', !(await page.locator('[data-testid="tour"]').evaluate((d) => d.open)));
    await page.reload();
    await page.waitForSelector('[data-testid="feed"]');
    check('tour ' + tag + ': does not come back on refresh', !(await page.locator('[data-testid="tour"]').evaluate((d) => d.open)));
    check('tour ' + tag + ': no errors', errors.length === 0, errors);
    await ctx.close();
    await b.close();
  }
  {
    const { ctx, page, errors } = await newPage(browser, { firstVisit: true });
    await page.goto(base);
    await page.waitForSelector('[data-testid="tour"][open]');
    await page.keyboard.press('Escape');
    check('tour: Escape closes it, and counts as seen', !(await page.locator('[data-testid="tour"]').evaluate((d) => d.open)));
    await page.locator('[data-testid="tour-reset"]').scrollIntoViewIfNeeded();
    await page.click('[data-testid="tour-reset"]');
    check('tutorial: the reset button restarts it as a new visitor', /Step 1 of 7/.test(await page.locator('[data-testid="tour-count"]').innerText()) && (await page.evaluate(() => localStorage.getItem('purplehub-tour-seen-v1'))) === null);
    check('tour: first step has no Back button', await page.locator('[data-testid="tour-back"]').isHidden());
    await page.click('[data-testid="tour-next"]');
    await page.click('[data-testid="tour-next"]');
    await page.click('[data-testid="tour-back"]');
    check('tour: Back goes back', /Step 2 of 7/.test(await page.locator('[data-testid="tour-count"]').innerText()));
    check('tour: keyboard focus stays on Next', await page.evaluate(() => document.activeElement.dataset.testid === 'tour-next'));
    check('tour: no console errors', errors.length === 0, errors);
    await ctx.close();
  }

  /* ---------- liquid glass, and what happens without it ---------- */
  for (const [name, engine] of ENGINES) {
    const b = await engine.launch();
    const { ctx, page, errors } = await newPage(b);
    await page.goto(base);
    await page.waitForSelector('[data-testid="feed"]');
    const g = await page.evaluate(() => {
      const warp = document.querySelector('.glass .tabs') && document.querySelector('.glass__warp');
      return { on: document.documentElement.classList.contains('lg-on'), adopted: !!document.querySelector('.glass .tabs'), card: !!document.querySelector('.glass .tour-card'), filter: warp ? getComputedStyle(warp).filter : '', blur: warp ? getComputedStyle(warp).backdropFilter : '' };
    });
    check('glass ' + name + ': the library holds the tab bar and tour card', g.on && g.adopted && g.card, g);
    check('glass ' + name + ': frosts the backdrop', /blur/.test(g.blur), g);
    check('glass ' + name + (name === 'webkit' ? ': skips displacement, which stops WebKit blurring' : ': bends light with the displacement filter'), name === 'webkit' ? g.filter === 'none' : /url/.test(g.filter), g);
    await page.click('.tabs a[href="#messages"]');
    await page.waitForSelector('#view-messages:not([hidden])');
    check('glass ' + name + ': tabs still navigate inside the library', (await page.locator('.tabs a[aria-current="page"]').getAttribute('href')) === '#messages');
    check('glass ' + name + ': no errors', errors.length === 0, errors);
    await ctx.close();
    await b.close();
  }
  {
    const stripped = fs.readFileSync(path.join(ROOT, 'dist', 'index.html'), 'utf8').replace(/<script>\/\* Generated by[\s\S]*?<\/script>/, '');
    const { ctx, page, errors } = await newPage(browser, { firstVisit: true, viewport: { width: 390, height: 844 } });
    await ctx.route(base, (r) => r.fulfill({ status: 200, contentType: 'text/html', body: stripped }));
    await page.goto(base);
    await page.waitForSelector('[data-testid="tour"][open]');
    check('no library: page still loads without it', !(await page.evaluate(() => document.documentElement.classList.contains('lg-on'))) && (await page.locator('.glass').count()) === 0);
    await page.click('[data-testid="tour-next"]');
    await page.click('[data-testid="tour-skip"]');
    await page.click('.tabs a[href="#messages"]');
    await page.waitForSelector('#view-messages:not([hidden])');
    const box = await page.locator('.tabs').boundingBox();
    check('no library: tab bar stays at the bottom and works', box.y + box.height <= 844 && box.y > 700, box);
    check('no library: no errors', errors.length === 0, errors);
    await ctx.close();
  }

  /* ---------- scales: every page at every size, in Chrome and in WebKit (Safari and all iPhone browsers) ---------- */
  for (const [name, engine] of ENGINES) {
    const b = await engine.launch();
    for (const [width, height] of SIZES) {
      const { ctx, page, errors } = await newPage(b, { viewport: { width, height }, as: ADMIN });
      const tag = name + ' ' + width + 'x' + height;
      const problems = [];
      for (const v of VIEWS) {
        await page.goto(base + '#' + v);
        await page.waitForSelector('#view-' + v + ':not([hidden])');
        const o = await page.evaluate(() => {
          const m = document.querySelector('main'), inner = m.getBoundingClientRect().right - parseFloat(getComputedStyle(m).paddingRight);
          const over = [...document.querySelectorAll('#view-' + (location.hash.slice(1) || 'week') + ' :is(.poster,.panel,.kpi,.past-card)')].filter((el) => el.getBoundingClientRect().right > inner + 1).length;
          return { sw: document.documentElement.scrollWidth, iw: innerWidth, over };
        });
        if (o.sw > o.iw) problems.push(v + ' scrolls sideways by ' + (o.sw - o.iw));
        if (o.over) problems.push(v + ' has ' + o.over + ' cards past the right margin');
      }
      await page.goto(base + '#week');
      await page.waitForSelector('[data-testid="feed"]');
      const onBar = width <= PHONE_BAR_MAX;
      const nav = await page.evaluate(() => {
        const items = [...document.querySelectorAll('.tabs a:not([hidden])')].map((a) => {
          const r = a.getBoundingClientRect(), hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          return { w: r.width, h: r.height, l: r.left, r: r.right, t: r.top, b: r.bottom, hit: !!hit && (hit === a || a.contains(hit)) };
        });
        return { items, vw: innerWidth, vh: innerHeight };
      });
      nav.items.forEach((it, i) => {
        if (it.l < 0 || it.r > nav.vw || it.t < 0 || it.b > nav.vh) problems.push('tab ' + i + ' off screen');
        if (!it.hit) problems.push('tab ' + i + ' cannot be pressed');
        if (it.h < (onBar ? 44 : 38) || it.w < 44) problems.push('tab ' + i + ' too small ' + Math.round(it.w) + 'x' + Math.round(it.h));
      });
      const barTop = Math.min(...nav.items.map((it) => it.t));
      const clash = await page.evaluate(() => { const box = (s) => document.querySelector(s).getBoundingClientRect(), hit = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top, bar = box('.tabs'); return [['brand', box('.brand')], ['actions', box('.top-actions')]].filter(([, r]) => hit(r, bar)).map(([n]) => n); });
      if (clash.length) problems.push('tab bar overlaps ' + clash.join(' and '));
      if (onBar && barTop < height / 2) problems.push('tab bar should be at the bottom');
      if (!onBar && barTop > 100) problems.push('tab bar should be at the top');
      await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
      await page.waitForTimeout(30);
      const foot = await page.evaluate(() => { const r = document.querySelector('[data-testid="tour-reset"]').getBoundingClientRect(), t = document.querySelector('.tabs').getBoundingClientRect(), f = document.querySelector('#ask-fab').getBoundingClientRect(); return { b: r.bottom, barTop: t.top, fabTop: f.top }; });
      if (onBar && foot.b > foot.barTop) problems.push('footer hidden behind the tab bar');
      if (foot.b > foot.fabTop) problems.push('footer hidden behind the assistant button');
      check('scales ' + tag + ': no sideways scroll, tabs reachable, footer clear', problems.length === 0 && errors.length === 0, problems.concat(errors));
      await ctx.close();
    }
    await b.close();
  }
  {
    const size = async (width) => { const { ctx, page } = await newPage(browser, { viewport: { width, height: 900 } }); await page.goto(base); const px = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize)); await ctx.close(); return px; };
    const [phone, mac, large, huge] = [await size(390), await size(1440), await size(1920), await size(2560)];
    check('scales: type is standard on phones and laptops, larger on big displays', phone === 16 && mac >= 16 && mac < 16.2 && large > 17 && huge === 19, [phone, mac, large, huge]);
    for (const [width, height] of [[390, 844], [1440, 900]]) {
      const { ctx, page } = await newPage(browser, { viewport: { width, height }, as: ADMIN });
      const off = [];
      for (const v of VIEWS) {
        await page.goto(base + '#' + v);
        await page.addStyleTag({ content: 'html{font-size:150%!important}' });
        await page.waitForTimeout(30);
        const o = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth }));
        if (o.sw > o.iw) off.push(v + ' by ' + (o.sw - o.iw));
      }
      check('scales: 150% text fits at ' + width + ' wide', off.length === 0, off);
      await ctx.close();
    }
  }

  /* ---------- PurpleHub.html is a complete file to send as an attachment ---------- */
  for (const [name, engine] of ENGINES) {
    const b = await engine.launch();
    const { ctx, page, errors } = await newPage(b, { firstVisit: true });
    const outside = [];
    page.on('request', (r) => { if (!/^(file|data):/.test(r.url())) outside.push(r.url()); });
    await page.goto('file://' + path.join(ROOT, 'PurpleHub.html'));
    await page.waitForSelector('[data-testid="tour"][open]');
    await page.click('[data-testid="tour-skip"]');
    check('attachment ' + name + ': opens from a file with no network requests', outside.length === 0, outside);
    check('attachment ' + name + ': glass, logo and events work from a file, with no errors', await page.evaluate(() => document.documentElement.classList.contains('lg-on') && getComputedStyle(document.querySelector('.usc-logo')).backgroundImage.startsWith('url("data:') && document.querySelectorAll('.poster').length === 5) && errors.length === 0, errors);
    await ctx.close();
    await b.close();
  }

  /* ---------- on Vercel with no database yet ---------- */
  {
    const hosted = await startServer(3980, { VERCEL: '1', DATABASE_URL: '' });
    const c = await browser.newContext();
    const h = 'http://127.0.0.1:3980/';
    check('no database: the page loads with empty data', (await (await c.request.get(h + 'api/data')).json()).user === null);
    const r = await (await c.request.post(h + 'api/chat', { headers: H, data: { messages: [{ role: 'user', content: 'when is the csa agm?' }] } })).json();
    check('no database: the assistant still answers', /Nov 2/.test(r.reply), r);
    const s = await c.request.post(h + 'api/login', { headers: H, data: { email: ADMIN, password: DEMO } });
    check('no database: sign-in explains itself', s.status() === 503 && /aren’t connected/.test((await s.json()).error));
    await c.close();
    await stopServer(hosted);
    const pollSrv = await startServer(3981, { VERCEL: '1' });
    const cc = await browser.newContext();
    await cc.addInitScript(() => { localStorage.setItem('purplehub-tour-seen-v1', '1'); });
    const o = 'http://127.0.0.1:3981/';
    await cc.request.post(o + 'api/login', { headers: H, data: { email: 'csa.demo@uwo.ca', password: DEMO } });
    const pg = await cc.newPage();
    const calls = [];
    pg.on('request', (q) => { if (q.url().endsWith('/api/data')) calls.push(1); });
    await pg.goto(o);
    await pg.waitForTimeout(9500);
    check('hosted: with no live connection, the page checks for updates', calls.length >= 2, calls.length);
    await cc.close();
    await stopServer(pollSrv);
  }

  /* ---------- blocked storage, cross-tab sync ---------- */
  {
    const { ctx, page, errors } = await newPage(browser);
    await ctx.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } }); });
    await page.goto(base);
    await page.waitForSelector('[data-testid="feed"]');
    check('blocked storage: the walkthrough still opens and closes', await page.locator('[data-testid="tour"]').evaluate((d) => d.open));
    await page.click('[data-testid="tour-skip"]');
    check('blocked storage: events still show', (await page.locator('[data-testid="feed"] .poster').count()) >= 4);
    check('blocked storage: no uncaught errors', errors.length === 0, errors);
    await ctx.close();
  }
  await browser.close();
  await stopServer(server);
  pgdb.stop(PG_DIR);
  fs.rmSync(PG_DIR, { recursive: true, force: true });
  const failed = results.filter((r) => !r.ok);
  console.log('\n' + (results.length - failed.length) + '/' + results.length + ' passed');
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error(e); pgdb.stop(PG_DIR); process.exit(1); });
