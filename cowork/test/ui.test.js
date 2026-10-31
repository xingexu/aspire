// End-to-end checks for the CoWork page. Run: node test/ui.test.js [--shots]
'use strict';
const { chromium, webkit, devices } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SHOTS = process.argv.includes('--shots');
const SHOT_DIR = path.join(ROOT, 'test', 'shots');
if (SHOTS) fs.mkdirSync(SHOT_DIR, { recursive: true });

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
  const { firstVisit, signedOut, ...ctxOpts } = opts || {};
  const ctx = await browser.newContext(Object.assign({ viewport: { width: 1440, height: 900 } }, ctxOpts));
  if (!firstVisit) await ctx.addInitScript(() => { try { localStorage.setItem('cowork-tour-seen-v1', '1'); } catch (e) { /* blocked */ } });
  // Signed in as the USC admin by default, since most checks need the gated pages.
  if (!signedOut) await ctx.addInitScript(() => { try { localStorage.setItem('cowork-session-v1', 'uscadmin'); } catch (e) { /* blocked */ } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  return { ctx, page, errors };
}
async function shot(page, name) { if (SHOTS) await page.screenshot({ path: path.join(SHOT_DIR, name + '.png'), fullPage: true }); }
const VIEWS = ['week', 'record', 'clubs', 'usc', 'why', 'demo'];
const ENGINES = [['chromium', chromium], ['webkit', webkit]];
// Phones in both orientations, tablets, then Mac windows from a small MacBook to a Studio Display.
const SIZES = [[320, 568], [375, 667], [390, 844], [430, 932], [844, 390], [768, 1024], [1024, 768], [1199, 800], [1200, 800], [1280, 800], [1512, 982], [1920, 1080], [2560, 1440]];
const TOUR_STEPS = 10;
const PHONE_BAR_MAX = 1199;

(async () => {
  const srv = await serve();
  const base = 'http://127.0.0.1:' + srv.address().port + '/';
  const browser = await chromium.launch();

  /* ---------- desktop light: content and flows ---------- */
  {
    const { ctx, page, errors } = await newPage(browser, { colorScheme: 'light' });
    await page.goto(base + '#week');
    await page.waitForSelector('[data-testid="feed"]');
    check('fonts: uses the system font, nothing to download', /-apple-system/.test(await page.evaluate(() => getComputedStyle(document.body).fontFamily)));
    check('title is CoWork', (await page.title()) === 'CoWork');
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
      const C = window.CoWork, s = C.fresh();
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
        await noOverflow(page, v + ' ' + vp.tag + ' ' + scheme);
        if (vp.tag === 'phone' || v === 'why' || v === 'week' || v === 'clubs' || v === 'record') await shot(page, vp.tag + '-' + scheme + '-' + v);
      }
      const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
      check('body background explicit: ' + vp.tag + ' ' + scheme, bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent', bg);
      check('no console errors: ' + vp.tag + ' ' + scheme, errors.length === 0, errors);
      await ctx.close();
    }
  }

  /* ---------- neutral at rest, purple only as a hover highlight; translucent boxes over the photo ---------- */
  for (const scheme of ['light', 'dark']) {
    const { ctx, page } = await newPage(browser, { colorScheme: scheme });
    const off = [], opaque = [], named = [];
    for (const v of VIEWS) {
      await page.goto(base + '#' + v);
      await page.waitForSelector('#view-' + v + ':not([hidden])');
      await page.waitForTimeout(260);
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
          [cs.backgroundColor, cs.color].forEach((c) => { const h = hue(c); if (h !== null && h >= 235 && h <= 345) off.push(view + ' ' + el.tagName + '.' + el.className + ' ' + c); });
        });
        document.querySelectorAll('#view-' + view + ' :is(.panel,.poster,.poster-top,.kpi,.rung,.fact)').forEach((el) => {
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
    const poster = page.locator('[data-testid="event-films"]');
    await poster.hover();
    await page.waitForTimeout(450);
    check('colour: containers highlight purple on hover', /rgb\(79, 38, 131\)/.test(await poster.evaluate((e) => getComputedStyle(e).boxShadow)));
    const dark = await page.evaluate(() => [...document.querySelectorAll('.btn:not(.ghost), .chip[aria-pressed="true"]')].filter((b) => { const m = getComputedStyle(b).backgroundColor.match(/[\d.]+/g).map(Number); return m[0] < 60 && m[1] < 60 && m[2] < 60; }).length);
    check('buttons: none are solid black', dark === 0, dark);
    await page.mouse.move(0, 0);
    // fades
    await page.click('.tabs a[href="#record"]');
    await page.waitForSelector('[data-testid="rung-show"]');
    const moving = await page.evaluate(() => document.querySelector('#tab-glider').getAnimations().length > 0);
    check('fade: the tab highlight glides to the new tab', moving);
    const f = await page.evaluate(() => ({ ghost: !!document.querySelector('.view-ghost'), ghostIds: document.querySelectorAll('.view-ghost [id], .view-ghost [data-testid], .view-ghost [data-act]').length, anims: document.querySelector('#view-record').getAnimations().length }));
    check('fade: pages cross-fade between clicks', f.ghost && f.anims > 0, f);
    check('fade: the outgoing copy has no live controls', f.ghostIds === 0, f);
    await page.waitForTimeout(520);
    const glide = await page.evaluate(() => { const g = document.querySelector('#tab-glider').getBoundingClientRect(), a = document.querySelector('.tabs a[aria-current="page"]').getBoundingClientRect(); return Math.abs(g.left - a.left) + Math.abs(g.width - a.width); });
    check('fade: the tab highlight lands exactly on the current tab', glide < 2, glide);
    check('fade: the outgoing copy is cleaned up', (await page.locator('.view-ghost').count()) === 0);
    await ctx.close();
  }

  /* ---------- logins ---------- */
  {
    const { ctx, page, errors } = await newPage(browser, { signedOut: true });
    await page.goto(base + '#usc');
    check('login: dashboard is locked when signed out', await page.locator('[data-testid="gate-admin"]').isVisible() && (await page.locator('[data-testid="kpi-first"]').count()) === 0);
    await page.goto(base + '#clubs');
    check('login: club tools are locked when signed out', await page.locator('[data-testid="gate-club"]').isVisible() && (await page.locator('[data-testid="club-hero"]').count()) === 0);
    check('login: student pages need no sign-in', await (async () => { await page.goto(base + '#week'); return page.locator('[data-testid="feed"]').isVisible(); })());
    await page.click('[data-testid="account"]');
    await page.fill('#lg-user', 'jordan');
    await page.fill('#lg-pass', 'wrong');
    await page.click('[data-testid="login-submit"]');
    check('login: wrong password is refused', /isn’t right/.test(await page.locator('#lg-err').innerText()));
    await page.fill('#lg-pass', 'club2026');
    await page.check('#lg-role-admin');
    await page.click('[data-testid="login-submit"]');
    check('login: a president cannot use the admin door', /club president account/.test(await page.locator('#lg-err').innerText()));
    await page.check('#lg-role-club');
    await page.click('[data-testid="login-submit"]');
    await page.waitForSelector('[data-testid="club-hero"]');
    check('login: president lands on their own club', /Pre-Law Society/.test(await page.locator('[data-testid="club-hero"]').innerText()) && (await page.locator('.club-switch').count()) === 0);
    await page.goto(base + '#usc');
    check('login: president cannot see the USC dashboard', await page.locator('[data-testid="gate-admin"]').isVisible());
    await page.reload();
    check('login: stays signed in after a refresh', (await page.locator('[data-testid="account"]').innerText()) === 'Jordan');
    await page.click('[data-testid="account"]');
    await page.click('[data-testid="signout"]');
    check('login: sign out locks it again', (await page.locator('[data-testid="account"]').innerText()) === 'Sign in');
    await page.click('[data-testid="gate-admin"] button');
    await page.click('[data-testid="login-demo"]');
    await page.click('[data-testid="login-submit"]');
    await page.waitForSelector('[data-testid="kpi-first"]');
    check('login: USC admin sees the dashboard', await page.locator('[data-testid="kpi-first"]').isVisible());
    await page.goto(base + '#clubs');
    check('login: USC admin can switch between clubs', await page.locator('.club-switch').isVisible());
    check('login: no errors', errors.length === 0, errors);
    await ctx.close();
  }

  /* ---------- USC logo ---------- */
  {
    const { ctx, page } = await newPage(browser);
    await page.goto(base + '#record');
    const logo = await page.evaluate(async () => {
      const el = document.querySelector('[data-testid="usc-logo"]'), r = el.getBoundingClientRect();
      const url = getComputedStyle(el).backgroundImage.match(/url\("(.*)"\)/)[1];
      const img = new Image(); img.src = url; await img.decode();
      return { w: r.width, h: r.height, natural: img.naturalWidth, dataUrl: url.startsWith('data:image/png'), all: document.querySelectorAll('.usc-logo').length, seal: !!document.querySelector('.seal .usc-logo'), foot: !!document.querySelector('footer .usc-logo') };
    });
    check('logo: in the header, embedded, and it decodes', logo.w >= 32 && logo.w === logo.h && logo.natural === 320 && logo.dataUrl, logo);
    check('logo: also on the record seal and footer', logo.seal && logo.foot, logo);
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
    check('tour ' + tag + ': opens by itself on the first visit', /Step 1 of 10/.test(await page.locator('[data-testid="tour-count"]').innerText()));
    const problems = [];
    const vw = page.viewportSize().width;
    for (let i = 0; i < TOUR_STEPS; i++) {
      await page.waitForTimeout(40);
      const st = await page.evaluate(() => {
        const box = (s) => { const el = document.querySelector(s); if (!el) return null; const r = el.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom }; };
        return { card: box('[data-testid="tour-card"]'), spot: box('[data-testid="tour-spot"]'), off: document.querySelector('[data-testid="tour-spot"]').classList.contains('off'),
          next: box('[data-testid="tour-next"]'), title: document.querySelector('[data-testid="tour-title"]').textContent, text: document.querySelector('[data-testid="tour-text"]').textContent,
          vw: innerWidth, vh: innerHeight, sw: document.documentElement.scrollWidth, scrollH: document.querySelector('[data-testid="tour-card"]').scrollHeight, clientH: document.querySelector('[data-testid="tour-card"]').clientHeight };
      });
      const label = 'step ' + (i + 1);
      if (st.card.l < 0 || st.card.r > st.vw + 0.5 || st.card.t < 0 || st.card.b > st.vh + 0.5) problems.push(label + ' card off screen ' + JSON.stringify(st.card));
      if (!st.title || st.text.length < 40) problems.push(label + ' has no explanation');
      if (st.sw > st.vw) problems.push(label + ' sideways scroll');
      const targeted = ![0, 4].includes(i);
      if (targeted && st.off) problems.push(label + ' spotlight is off');
      if (targeted && !st.off && (st.spot.b < 0 || st.spot.t > st.vh)) problems.push(label + ' spotlight off screen');
      if (targeted && !st.off && st.card.l < st.spot.r - 0.5 && st.card.r > st.spot.l + 0.5 && st.card.t < st.spot.b - 0.5 && st.card.b > st.spot.t + 0.5) problems.push(label + ' card covers the spotlight');
      if (i === 1) {
        const onBar = vw <= PHONE_BAR_MAX;
        if (!(onBar ? /bottom/ : /top/).test(st.text)) problems.push('nav step names the wrong screen edge: ' + st.text);
      }
      if (i === 3) {
        const inSpot = await page.evaluate(() => { const a = document.querySelector('[data-testid="feed"] [data-act="checkin"]').getBoundingClientRect(), s = document.querySelector('[data-testid="tour-spot"]').getBoundingClientRect(); return a.left >= s.left && a.right <= s.right && a.top >= s.top && a.bottom <= s.bottom; });
        if (!inSpot) problems.push('spotlight misses the I’m here button');
      }
      if (i < TOUR_STEPS - 1) await page.click('[data-testid="tour-next"]');
    }
    check('tour ' + tag + ': all 10 steps fit the screen and point at the right thing', problems.length === 0, problems);
    await page.click('[data-testid="tour-skip"]');
    check('tour ' + tag + ': finishes', !(await page.locator('[data-testid="tour"]').evaluate((d) => d.open)));
    await page.reload();
    await page.waitForSelector('[data-testid="feed"]');
    check('tour ' + tag + ': does not come back on refresh', !(await page.locator('[data-testid="tour"]').evaluate((d) => d.open)));
    await page.click('[data-testid="help"]');
    check('tour ' + tag + ': Help reopens it', await page.locator('[data-testid="tour"]').evaluate((d) => d.open));
    await page.click('[data-testid="tour-skip"]');
    check('tour ' + tag + ': no errors', errors.length === 0, errors);
    await ctx.close();
    await b.close();
  }
  {
    const { ctx, page, errors } = await newPage(browser, { firstVisit: true });
    await page.goto(base + '#demo');
    await page.waitForSelector('[data-testid="step-1"]');
    check('tour: stays out of the way on the live demo page', !(await page.locator('[data-testid="tour"]').evaluate((d) => d.open)));
    await page.goto(base + '#week');
    await page.reload();
    await page.waitForSelector('[data-testid="tour"][open]');
    await page.keyboard.press('Escape');
    check('tour: Escape closes it', !(await page.locator('[data-testid="tour"]').evaluate((d) => d.open)));
    await page.reload();
    await page.waitForSelector('[data-testid="feed"]');
    check('tour: Escape counts as seen', !(await page.locator('[data-testid="tour"]').evaluate((d) => d.open)));
    await page.click('[data-testid="help"]');
    check('tour: first step has no Back button', await page.locator('[data-testid="tour-back"]').isHidden());
    await page.click('[data-testid="tour-next"]');
    await page.click('[data-testid="tour-next"]');
    await page.click('[data-testid="tour-back"]');
    check('tour: Back goes back', /Step 2 of 10/.test(await page.locator('[data-testid="tour-count"]').innerText()));
    check('tour: keyboard focus stays on Next', await page.evaluate(() => document.activeElement.dataset.testid === 'tour-next'));
    for (let i = 1; i < TOUR_STEPS; i++) {
      if (i === 7) check('tour: moves to My record and shows the next step', (await page.url()).endsWith('#record') && await page.locator('[data-testid="next-step"]').isVisible());
      await page.click('[data-testid="tour-next"]');
    }
    await page.waitForSelector('#dlg-checkin[open]');
    check('tour: practice opens a real check-in with the code shown', (await page.locator('#ci-hint').innerText()).length === 4 && (await page.url()).endsWith('#week'));
    await page.fill('#ci-code', await page.locator('#ci-hint').innerText());
    await page.click('#ci-submit');
    check('tour: the practice check-in works', await page.locator('[data-testid="checkin-done"]').isVisible());
    await page.click('#ci-done button[data-close]');
    check('tour: no console errors', errors.length === 0, errors);
    await ctx.close();
  }

  /* ---------- liquid glass, and what happens without it ---------- */
  for (const [name, engine] of ENGINES) {
    const b = await engine.launch();
    const { ctx, page, errors } = await newPage(b);
    await page.goto(base + '#week');
    await page.waitForSelector('[data-testid="feed"]');
    const g = await page.evaluate(() => {
      const warp = document.querySelector('.glass .tabs') && document.querySelector('.glass__warp');
      return { on: document.documentElement.classList.contains('lg-on'), adopted: !!document.querySelector('.glass .tabs'), card: !!document.querySelector('.glass .tour-card'), filter: warp ? getComputedStyle(warp).filter : '', blur: warp ? getComputedStyle(warp).backdropFilter : '', links: document.querySelectorAll('.glass .tabs a').length };
    });
    check('glass ' + name + ': the library holds the tab bar and tour card', g.on && g.adopted && g.card && g.links === 6, g);
    check('glass ' + name + ': frosts the backdrop', /blur/.test(g.blur), g);
    check('glass ' + name + (name === 'webkit' ? ': skips displacement, which stops WebKit blurring' : ': bends light with the displacement filter'), name === 'webkit' ? g.filter === 'none' : /url/.test(g.filter), g);
    await page.click('.tabs a[href="#clubs"]');
    await page.waitForSelector('[data-testid="club-hero"]');
    check('glass ' + name + ': tabs still navigate inside the library', (await page.locator('.tabs a[aria-current="page"]').getAttribute('href')) === '#clubs' && await page.locator('[data-testid="club-hero"]').isVisible());
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
    await page.click('.tabs a[href="#record"]');
    await page.waitForSelector('[data-testid="rung-show"]');
    const box = await page.locator('.tabs').boundingBox();
    check('no library: tab bar stays at the bottom and works', box.y + box.height <= 844 && box.y > 700 && await page.locator('[data-testid="rung-show"]').isVisible(), box);
    check('no library: no errors', errors.length === 0, errors);
    await ctx.close();
  }

  /* ---------- scales: every page at every size, in Chrome and in WebKit (Safari and all iPhone browsers) ---------- */
  for (const [name, engine] of ENGINES) {
    const b = await engine.launch();
    for (const [width, height] of SIZES) {
      const { ctx, page, errors } = await newPage(b, { viewport: { width, height } });
      const tag = name + ' ' + width + 'x' + height;
      const problems = [];
      for (const v of VIEWS) {
        await page.goto(base + '#' + v);
        await page.waitForSelector('#view-' + v + ':not([hidden])');
        const o = await page.evaluate(() => {
          const main = document.querySelector('main').getBoundingClientRect(), cs = getComputedStyle(document.querySelector('main'));
          const inner = main.right - parseFloat(cs.paddingRight);
          const over = [...document.querySelectorAll('#view-' + location.hash.slice(1) + ' :is(.poster,.panel,.kpi,.fact,.rung)')].filter((el) => el.getBoundingClientRect().right > inner + 1).length;
          return { sw: document.documentElement.scrollWidth, iw: innerWidth, over };
        });
        if (o.sw > o.iw) problems.push(v + ' scrolls sideways by ' + (o.sw - o.iw));
        if (o.over) problems.push(v + ' has ' + o.over + ' cards past the right margin');
      }
      await page.goto(base + '#week');
      await page.waitForSelector('[data-testid="feed"]');
      const onBar = width <= PHONE_BAR_MAX;
      const nav = await page.evaluate(() => {
        const items = [...document.querySelectorAll('.tabs a')].map((a) => {
          const r = a.getBoundingClientRect(), hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          return { w: r.width, h: r.height, l: r.left, r: r.right, t: r.top, b: r.bottom, hit: !!hit && (hit === a || a.contains(hit)), scroll: a.scrollWidth > a.clientWidth + 1 };
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
      // Nothing is trapped under the bar: the last control on the page can be reached.
      await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
      await page.waitForTimeout(30);
      const foot = await page.evaluate(() => { const r = document.querySelector('[data-testid="reset-all"]').getBoundingClientRect(), t = document.querySelector('.tabs').getBoundingClientRect(); return { b: r.bottom, barTop: t.top, atBottom: true }; });
      if (onBar && foot.b > foot.barTop) problems.push('footer hidden behind the tab bar');
      check('scales ' + tag + ': no sideways scroll, tabs reachable, footer clear', problems.length === 0 && errors.length === 0, problems.concat(errors));
      await ctx.close();
    }
    await b.close();
  }
  {
    const size = async (width) => { const { ctx, page } = await newPage(browser, { viewport: { width, height: 900 } }); await page.goto(base); const px = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize)); await ctx.close(); return px; };
    const [phone, mac, large, huge] = [await size(390), await size(1440), await size(1920), await size(2560)];
    check('scales: type is standard on phones and laptops, larger on big displays', phone === 16 && mac >= 16 && mac < 16.2 && large > 17 && huge === 19, [phone, mac, large, huge]);
    // Larger text in browser or system settings must not break the layout.
    for (const [width, height] of [[390, 844], [1440, 900]]) {
      const { ctx, page } = await newPage(browser, { viewport: { width, height } });
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

  /* ---------- CoWork.html is a complete file to send as an attachment ---------- */
  for (const [name, engine] of ENGINES) {
    const b = await engine.launch();
    const { ctx, page, errors } = await newPage(b, { firstVisit: true });
    const outside = [];
    page.on('request', (r) => { if (!/^(file|data):/.test(r.url())) outside.push(r.url()); });
    await page.goto('file://' + path.join(ROOT, 'CoWork.html'));
    await page.waitForSelector('[data-testid="tour"][open]');
    await page.click('[data-testid="tour-skip"]');
    check('attachment ' + name + ': opens from a file with no network requests', outside.length === 0, outside);
    check('attachment ' + name + ': glass and logo work from a file', await page.evaluate(() => document.documentElement.classList.contains('lg-on') && getComputedStyle(document.querySelector('.usc-logo')).backgroundImage.startsWith('url("data:')));
    await page.click('[data-testid="feed"] [data-act="checkin"]');
    check('attachment ' + name + ': works, with no errors', await page.locator('#dlg-checkin').evaluate((d) => d.open) && errors.length === 0, errors);
    await ctx.close();
    await b.close();
  }

  /* ---------- blocked storage, cross-tab sync ---------- */
  {
    const { ctx, page, errors } = await newPage(browser);
    await ctx.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } }); });
    await page.goto(base + '#week');
    await page.waitForSelector('[data-testid="feed"]');
    check('blocked storage: the walkthrough still opens and closes', await page.locator('[data-testid="tour"]').evaluate((d) => d.open));
    await page.click('[data-testid="tour-skip"]');
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
