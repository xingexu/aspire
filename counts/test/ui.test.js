// End-to-end checks for the Counts page. Run: node test/ui.test.js [--shots]
'use strict';
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const SHOTS = process.argv.includes('--shots');
const SHOT_DIR = path.join(ROOT, 'test', 'shots');
if (SHOTS) fs.mkdirSync(SHOT_DIR, { recursive: true });
const FONT_DIR = path.join(__dirname, 'fonts');
const fontCss = fs.readFileSync(path.join(FONT_DIR, 'fonts.css'), 'utf8');

function serve() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const f = path.join(ROOT, 'dist', 'index.html');
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      fs.createReadStream(f).pipe(res);
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}
async function routeFonts(ctx) {
  await ctx.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/css', body: fontCss }));
  await ctx.route('https://fonts.gstatic.com/**', (r) => {
    const h = crypto.createHash('md5').update(r.request().url()).digest('hex').slice(0, 16);
    const f = path.join(FONT_DIR, h + '.bin');
    if (fs.existsSync(f)) return r.fulfill({ status: 200, contentType: 'font/woff2', body: fs.readFileSync(f) });
    return r.fulfill({ status: 404, body: '' });
  });
}
const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: !!ok });
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok || detail === undefined ? '' : ' :: ' + String(JSON.stringify(detail)).slice(0, 300)));
}
async function noOverflow(page, label) {
  const o = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
  check('no horizontal scroll: ' + label, o.sw <= o.iw, o);
}
async function newPage(browser, opts) {
  const ctx = await browser.newContext(Object.assign({ viewport: { width: 1440, height: 900 } }, opts || {}));
  await routeFonts(ctx);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  return { ctx, page, errors };
}
async function shot(page, name) { if (SHOTS) await page.screenshot({ path: path.join(SHOT_DIR, name + '.png'), fullPage: true }); }
const VIEWS = ['week', 'record', 'clubs', 'usc', 'why', 'demo'];

(async () => {
  const srv = await serve();
  const base = 'http://127.0.0.1:' + srv.address().port + '/';
  const browser = await chromium.launch();

  /* ---------- desktop light: content and flows ---------- */
  {
    const { ctx, page, errors } = await newPage(browser, { colorScheme: 'light' });
    await page.goto(base + '#week');
    await page.waitForSelector('[data-testid="feed"]');
    await page.evaluate(() => document.fonts.ready);
    const fontsOk = await page.evaluate(async () => {
      await Promise.all(['800 30px "Bricolage Grotesque"', '16px "Schibsted Grotesk"', '600 16px "IBM Plex Mono"'].map((f) => document.fonts.load(f)));
      const fams = new Set([...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family.replace(/["']/g, '')));
      return ['Bricolage Grotesque', 'Schibsted Grotesk', 'IBM Plex Mono'].every((f) => fams.has(f));
    });
    check('fonts: all three faces load', fontsOk);
    check('title is Counts', (await page.title()) === 'Counts');
    check('week: 6 events count this week', (await page.locator('[data-testid="feed"] .poster').count()) === 6);
    check('week: mock trial not in feed until the club opts in', (await page.locator('[data-testid="event-mock"]').count()) === 0);
    check('week: every poster says why it matters nearby', await page.locator('#view-week .why').isVisible());
    await page.click('button[data-act="filter"][data-v="Careers"]');
    check('week: Careers filter shows 2', (await page.locator('[data-testid="feed"] .poster').count()) === 2 && /2 events in Careers/.test(await page.locator('[data-testid="feed-count"]').innerText()));
    await page.click('button[data-act="filter"][data-v="All"]');

    // check-in: wrong code, then right code
    await page.click('[data-testid="event-films"] button[data-act="checkin"]');
    check('checkin: dialog opens with demo code', (await page.locator('#ci-hint').innerText()) === 'OWL7');
    await page.fill('#ci-code', 'nope');
    await page.click('#ci-submit');
    check('checkin: wrong code shows an error', /doesn’t match/.test(await page.locator('#ci-err').innerText()));
    await page.fill('#ci-code', 'owl7');
    await page.click('#ci-submit');
    await page.waitForSelector('[data-testid="checkin-done"]');
    check('checkin: first visit pays the club', /First time with Night Owls Film Club/.test(await page.locator('[data-testid="checkin-done"]').innerText()));
    await page.click('#ci-done button[data-close]');
    check('checkin: dialog closes', !(await page.locator('#dlg-checkin').evaluate((d) => d.open)));
    check('checkin: poster shows checked in', /first time with this club/.test(await page.locator('[data-testid="checked-films"]').innerText()));

    // pitch in at the LSAT study circle
    await page.click('[data-testid="event-lsat"] button[data-act="pitchin"]');
    await page.click('#pi-form button[type="submit"]');
    check('pitch: poster shows request', /Asked to pitch in as greeter/.test(await page.locator('[data-testid="event-lsat"]').innerText()));

    // record
    await page.goto(base + '#record');
    await page.waitForSelector('[data-testid="rung-show"]');
    check('record: show up counts 3 clubs', /3 clubs/.test(await page.locator('[data-testid="rung-show"]').innerText()));
    check('record: pitch in waits for the club', /Waiting to confirm/.test(await page.locator('[data-testid="rung-pitch"]').innerText()));
    check('record: activity lists the check-in', /Checked in at Short films and pizza/.test(await page.locator('[data-testid="activity"]').innerText()));

    // clubs: confirm the pitch, opt the mock trial in
    await page.goto(base + '#clubs');
    await page.waitForSelector('[data-testid="club-hero"]');
    check('clubs: Pre-Law shown by default', /Pre-Law Society/.test(await page.locator('[data-testid="club-hero"]').innerText()));
    check('clubs: members meter shows 27 / 30', /27 \/ 30/.test(await page.locator('#view-clubs').innerText()));
    await page.click('[data-testid="pitch-lsat"] button[data-act="confirm-pitch"]');
    check('clubs: pitch confirmed', /Confirmed/.test(await page.locator('[data-testid="pitch-lsat"]').innerText()));
    await page.click('[data-testid="make-mock"]');
    const submit = page.locator('[data-testid="optin-mock"]');
    check('clubs: turn-on disabled until all promises', await submit.isDisabled());
    await page.check('#p-open-mock');
    await page.check('#p-free-mock');
    check('clubs: still disabled with two of three', await submit.isDisabled());
    await page.check('#p-door-mock');
    check('clubs: enabled with all three', await submit.isEnabled());
    await submit.click();
    check('clubs: door sign shows code', /LAW4/.test(await page.locator('[data-testid="sign-mock"]').innerText()));
    await page.goto(base + '#week');
    check('week: mock trial appears after opt-in', await page.locator('[data-testid="event-mock"]').isVisible());

    // record after confirm, then Policy Fellows and résumé lines
    await page.goto(base + '#record');
    check('record: pitch in done after confirm', /Done/.test(await page.locator('[data-testid="rung-pitch"]').innerText()));
    check('record: résumé has the volunteer line', /Volunteered as greeter for Pre-Law Society/.test(await page.locator('[data-testid="resume"]').innerText()));
    await page.click('[data-testid="fellows-card"] button[data-act="fellows"]');
    check('record: fellows applied', /Applied/.test(await page.locator('[data-testid="fellows-card"]').innerText()) && /Applied/.test(await page.locator('[data-testid="rung-rep"]').innerText()));
    await page.click('button[data-act="copy-resume"]');
    await page.waitForTimeout(150);
    check('record: copy gives feedback', /Copied|Selected/.test(await page.locator('#copy-msg').innerText()));

    // USC dashboard reflects the live clicks
    await page.goto(base + '#usc');
    check('usc: simulated banner shown', await page.locator('[data-testid="sim-banner"]').isVisible());
    check('usc: first-timers up by 1', /743/.test(await page.locator('[data-testid="kpi-first"]').innerText()));
    check('usc: paid up by $3', /\$2,193/.test(await page.locator('[data-testid="kpi-paid"]').innerText()));
    check('usc: fellows applicants 13', (await page.locator('[data-testid="pipe-fellows"]').innerText()) === '13');
    check('usc: Spoke screen lists events', (await page.locator('[data-testid="spoke-screen"] li').count()) === 4);

    // rules
    const rules = await page.evaluate(() => {
      const C = window.Counts, s = C.fresh();
      for (let i = 0; i < 60; i++) C.checkIn(s, 'films', 'OWL7', 's' + i);
      const capped = C.payout(s, 'films');
      const again = C.checkIn(s, 'films', 'OWL7', 's1');
      const second = C.checkIn(s, 'dumplings', 'FOLD', 'me'); // Maya already visited Heritage Kitchen
      const closed = C.checkIn(s, 'mock', 'LAW4', 'me');
      const badOpt = C.optIn(s, 'mock', { open: true, free: true, door: false });
      return { capped, again: again.already === true, second: second.ok && second.first === false, closed: closed.ok === false, badOpt: badOpt.ok === false };
    });
    check('rules: payout capped at $150 an event', rules.capped === 150, rules);
    check('rules: no double check-in', rules.again);
    check('rules: returning student is not a first-timer', rules.second, rules);
    check('rules: no check-in before a club opts in', rules.closed);
    check('rules: opt-in needs all three promises', rules.badOpt);
    await shot(page, 'desk-light-usc');
    check('desktop light: no console errors', errors.length === 0, errors);
    await ctx.close();
  }

  /* ---------- live demo ---------- */
  {
    const { ctx, page, errors } = await newPage(browser, { colorScheme: 'light' });
    await page.goto(base + '#demo');
    await page.waitForSelector('[data-testid="step-1"]');
    await shot(page, 'demo-0');
    for (let i = 1; i <= 5; i++) {
      await page.click('[data-testid="step-' + i + '"]');
      await page.waitForTimeout(80);
      if (i === 2) check('demo 2: phone gets the notification', await page.locator('[data-testid="notif"]').isVisible());
      if (i === 3) check('demo 3: phone shows +1 first visit', /First time with Pre-Law Society/.test(await page.locator('[data-testid="phone-success"]').innerText()) && /\$3/.test(await page.locator('[data-testid="desk-earned"]').innerText()));
      if (i === 4) check('demo 4: record shows pitch in done and applied', /Pitch in\s*Done/.test(await page.locator('[data-testid="phone"]').innerText()) && /Applied/.test(await page.locator('[data-testid="phone"]').innerText()));
      if (i === 1) check('demo 1: caption explains why', /One checkbox/.test(await page.locator('[data-testid="demo-caption"]').innerText()));
      await shot(page, 'demo-' + i);
    }
    check('demo: all five steps marked done', (await page.locator('.step-btn[data-state="done"]').count()) === 5);
    check('demo 5: dashboard deltas', /743/.test(await page.locator('[data-testid="desk-kpi-first"]').innerText()) && /\+1/.test(await page.locator('[data-testid="desk-kpi-fellows"]').innerText()));
    await page.click('[data-testid="demo-reset"]');
    check('demo: reset clears steps', (await page.locator('.step-btn[data-state="done"]').count()) === 0);
    // skip ahead: step 5 first runs everything
    await page.click('[data-testid="step-5"]');
    check('demo: jumping to 5 runs 1-4', (await page.locator('.step-btn[data-state="done"]').count()) === 5);
    await page.click('[data-testid="demo-reset"]');
    check('demo: no console errors', errors.length === 0, errors);
    await ctx.close();
  }

  /* ---------- every view, both themes, two widths ---------- */
  for (const scheme of ['light', 'dark']) {
    for (const vp of [{ width: 1440, height: 900, tag: 'desk' }, { width: 390, height: 844, tag: 'phone' }]) {
      const { ctx, page, errors } = await newPage(browser, { colorScheme: scheme, viewport: { width: vp.width, height: vp.height } });
      for (const v of VIEWS) {
        await page.goto(base + '#' + v);
        await page.waitForSelector('#view-' + v + ':not([hidden])');
        await page.evaluate(() => document.fonts.ready);
        await noOverflow(page, v + ' ' + vp.tag + ' ' + scheme);
        if (vp.tag === 'phone' || v === 'why' || v === 'week' || v === 'clubs' || v === 'record') await shot(page, vp.tag + '-' + scheme + '-' + v);
      }
      const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
      check('body background explicit: ' + vp.tag + ' ' + scheme, bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent', bg);
      check('no console errors: ' + vp.tag + ' ' + scheme, errors.length === 0, errors);
      await ctx.close();
    }
  }

  /* ---------- explicit theme attribute beats system ---------- */
  {
    const { ctx, page } = await newPage(browser, { colorScheme: 'dark' });
    await page.goto(base + '#week');
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    check('data-theme=light wins over dark system', bg === 'rgb(244, 243, 246)', bg);
    await ctx.close();
  }

  /* ---------- blocked storage, cross-tab sync ---------- */
  {
    const { ctx, page, errors } = await newPage(browser);
    await ctx.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } }); });
    await page.goto(base + '#week');
    await page.waitForSelector('[data-testid="feed"]');
    await page.click('[data-testid="event-arm"] button[data-act="checkin"]');
    await page.fill('#ci-code', 'BOLT');
    await page.click('#ci-submit');
    check('blocked storage: check-in still works', await page.locator('[data-testid="checkin-done"]').isVisible());
    check('blocked storage: no uncaught errors', errors.length === 0, errors);
    await ctx.close();
  }
  {
    const { ctx, page } = await newPage(browser);
    await page.goto(base + '#usc');
    const other = await ctx.newPage();
    await routeFonts(ctx);
    await other.goto(base + '#demo');
    await other.click('[data-testid="step-3"]');
    await page.waitForTimeout(300);
    check('sync: second tab updates the dashboard', /743/.test(await page.locator('[data-testid="kpi-first"]').innerText()));
    await other.click('[data-testid="demo-reset"]');
    await ctx.close();
  }

  await browser.close();
  srv.close();
  const failed = results.filter((r) => !r.ok);
  console.log('\n' + (results.length - failed.length) + '/' + results.length + ' passed');
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
