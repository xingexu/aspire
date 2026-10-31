// End-to-end checks for the FoodLink demo page. Run: node test/ui.test.js [--shots]
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
      const f = path.join(ROOT, 'dist', decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'preview.html');
      if (!f.startsWith(path.join(ROOT, 'dist')) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
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
    if (fs.existsSync(f)) return r.fulfill({ status: 200, contentType: 'font/ttf', body: fs.readFileSync(f) });
    return r.fulfill({ status: 404, body: '' });
  });
}

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: !!ok, detail });
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok || detail === undefined ? '' : ' :: ' + String(JSON.stringify(detail)).slice(0, 300)));
}

async function noOverflow(page, label) {
  const o = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
  check('no horizontal scroll: ' + label, o.sw <= o.iw, o);
}

async function newPage(browser, base, opts) {
  const ctx = await browser.newContext(Object.assign({ viewport: { width: 1280, height: 860 } }, opts || {}));
  await routeFonts(ctx);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  return { ctx, page, errors };
}

(async () => {
  const srv = await serve();
  const base = 'http://127.0.0.1:' + srv.address().port + '/preview.html';
  const browser = await chromium.launch();

  /* ---------- desktop, light ---------- */
  {
    const { ctx, page, errors } = await newPage(browser, base, { colorScheme: 'light' });
    await page.goto(base + '#find');
    await page.waitForSelector('[data-testid="point-ucc"]');
    await page.evaluate(() => document.fonts.ready);
    check('find: two Points rendered', (await page.locator('article[data-testid^="point-"]').count()) === 2);
    check('find: 12 category tiles', (await page.locator('.cat').count()) === 12);
    const proteinTxt = await page.locator('[data-testid="cat-ucc-protein"]').innerText();
    check('find: UCC protein starts low', /Running low/.test(proteinTxt), proteinTxt);
    check('find: no live drops at start', await page.locator('[data-testid="no-drops"]').isVisible());
    check('find: help list has 5 entries', (await page.locator('.help-item').count()) === 5);
    const fontsOk = await page.evaluate(() => document.fonts.check('700 16px "Source Sans 3"') && document.fonts.check('16px "Source Sans 3"'));
    check('fonts load', fontsOk);
    if (SHOTS) await page.screenshot({ path: path.join(SHOT_DIR, 'find-desktop.png'), fullPage: true });

    // report an empty shelf
    await page.click('[data-testid="point-ucc"] [data-act="report-open"]');
    await page.click('[data-testid="point-ucc"] [data-act="report"][data-cat="protein"]');
    await page.waitForFunction(() => /Reported empty/.test(document.querySelector('[data-testid="cat-ucc-protein"]').innerText));
    check('report: UCC protein shows reported empty', true);
    const count0 = await page.locator('[data-testid="cat-ucc-protein"] .cat-count').innerText();
    check('report: tile shows 0 while reported empty', count0.trim() === '0', count0);

    // restock: checklist required
    await page.click('a[href="#restock"]');
    await page.waitForSelector('[data-testid="rs-submit"]');
    check('restock: open report banner shown', await page.locator('[data-testid="rs-reports"]').isVisible());
    await page.click('[data-testid="rs-submit"]');
    await page.waitForSelector('.msg.bad[role="alert"]');
    const errTxt = await page.locator('.msg.bad[role="alert"]').innerText();
    check('restock: blocked without checklist', /sealed/.test(errTxt) && /best-before/.test(errTxt), errTxt);
    // fill protein added = 14 via input
    const added = page.locator('input[data-key="rs-protein-added"]');
    await added.fill('14');
    await added.press('Tab');
    for (const k of ['sealed', 'dated', 'shelfStable']) await page.check('input[data-check="' + k + '"]');
    await page.click('[data-testid="rs-submit"]');
    await page.waitForSelector('.msg.good[role="status"]');
    const okTxt = await page.locator('.msg.good[role="status"]').innerText();
    check('restock: logged', /Logged at/.test(okTxt), okTxt);
    check('restock: report banner cleared', (await page.locator('[data-testid="rs-reports"]').count()) === 0);
    await noOverflow(page, 'restock desktop');
    if (SHOTS) await page.screenshot({ path: path.join(SHOT_DIR, 'restock-desktop.png'), fullPage: true });

    await page.click('a[href="#find"]');
    await page.waitForSelector('[data-testid="cat-ucc-protein"]');
    const p2 = await page.locator('[data-testid="cat-ucc-protein"]').innerText();
    check('find: protein restocked to 14', /\b14\b/.test(p2) && !/Reported empty/.test(p2), p2);

    // partner drop: invalid then valid
    await page.click('a[href="#drops"]');
    await page.waitForSelector('[data-testid="dp-submit"]');
    await page.uncheck('input[data-check="sealed"]');
    check('drop: unsealed food blocked', await page.locator('[data-testid="dp-submit"]').isDisabled());
    const rules = await page.locator('[data-testid="dp-rules"]').innerText();
    check('drop: rules explain why', /sealed/i.test(rules), rules);
    await page.check('input[data-check="sealed"]');
    await page.click('input[data-key="dp-kind-shelf"]');
    await page.waitForSelector('input[data-key="dp-bb"]');
    check('drop: shelf-stable asks for best-before', /best-before/i.test(await page.locator('[data-testid="dp-rules"]').innerText()));
    await page.click('input[data-key="dp-kind-prepared"]');
    await page.selectOption('select[data-key="dp-window"]', '240');
    check('drop: prepared food limited to 2 h', await page.locator('[data-testid="dp-submit"]').isDisabled());
    await page.selectOption('select[data-key="dp-window"]', '90');
    await page.fill('input[data-key="dp-title"]', 'Turkey wraps');
    await page.fill('input[data-key="dp-qty"]', '10');
    await page.locator('input[data-key="dp-qty"]').press('Tab');
    await page.click('[data-testid="dp-submit"]');
    await page.waitForSelector('.msg.good[role="status"]');
    check('drop: posted', /Live now/.test(await page.locator('.msg.good[role="status"]').innerText()));
    check('drop: listed as live', (await page.locator('[data-testid^="live-drop-"]').count()) === 1);
    await noOverflow(page, 'drops desktop');
    if (SHOTS) await page.screenshot({ path: path.join(SHOT_DIR, 'drops-desktop.png'), fullPage: true });

    // reserve on find
    await page.click('a[href="#find"]');
    await page.waitForSelector('[data-act="reserve"]');
    const card = page.locator('[data-testid^="drop-d_"]').first();
    const cardTxt = await card.innerText();
    check('find: drop card shows 10 left', /10\s*of 10 left/.test(cardTxt), cardTxt);
    await card.locator('[data-act="reserve"]').click();
    await page.waitForSelector('[data-testid^="code-"]');
    const code = (await page.locator('[data-testid^="code-"]').first().innerText()).trim();
    check('reserve: code shown', /^FL-\d{4}$/.test(code), code);
    const cardTxt2 = await page.locator('[data-testid^="drop-d_"]').first().innerText();
    check('reserve: count decremented', /9\s*of 10 left/.test(cardTxt2), cardTxt2);

    // pickup
    await page.click('a[href="#drops"]');
    await page.waitForSelector('input[data-key="pk-code"]');
    await page.fill('input[data-key="pk-code"]', 'FL-0000');
    await page.click('[data-act="pickup"]');
    await page.waitForSelector('.msg.bad[role="alert"]');
    check('pickup: unknown code rejected', true);
    await page.fill('input[data-key="pk-code"]', code.toLowerCase());
    await page.press('input[data-key="pk-code"]', 'Enter');
    await page.waitForFunction(() => /Picked up/.test(document.body.innerText));
    check('pickup: code confirmed (lowercase accepted)', true);

    // impact
    await page.click('a[href="#impact"]');
    await page.waitForSelector('[data-testid="kpi-items"]');
    const k = await page.locator('[data-testid="kpi-items"]').innerText();
    check('impact: items KPI shows target', /of 1,000/.test(k), k);
    check('impact: chart has 14 days', (await page.locator('.chart svg g').count()) === 14);
    const feed = await page.locator('[data-testid="feed"]').innerText();
    check('impact: live feed shows pickup', /Pickup confirmed/.test(feed), feed.slice(0, 200));
    check('impact: decision criteria listed', (await page.locator('.criteria li').count()) === 5);
    await noOverflow(page, 'impact desktop');
    if (SHOTS) await page.screenshot({ path: path.join(SHOT_DIR, 'impact-desktop.png'), fullPage: true });

    // persistence across reload
    await page.reload();
    await page.waitForSelector('[data-testid="kpi-items"]');
    const feed2 = await page.locator('[data-testid="feed"]').innerText();
    check('persistence: live actions survive reload', /Pickup confirmed/.test(feed2));

    check('desktop: no console errors', errors.length === 0, errors);
    await ctx.close();
  }

  /* ---------- presenter mode ---------- */
  {
    const { ctx, page, errors } = await newPage(browser, base, { viewport: { width: 1440, height: 900 }, colorScheme: 'light' });
    await page.goto(base + '#present');
    await page.waitForSelector('#pane-phone [data-testid="point-ucc"]');
    await page.click('[data-testid="reset"]');
    await page.waitForTimeout(300);
    check('present: phone and screen panes', (await page.locator('#pane-phone').count()) === 1 && (await page.locator('#pane-screen [data-testid="kpi-items"]').count()) === 1);
    if (SHOTS) await page.screenshot({ path: path.join(SHOT_DIR, 'present-0.png') });
    await page.click('[data-testid="step-1"]');
    await page.waitForFunction(() => /Reported empty/.test(document.querySelector('#pane-phone [data-testid="cat-ucc-protein"]').innerText), null, { timeout: 5000 });
    check('present step 1: phone shows report', true);
    await page.click('[data-testid="step-2"]');
    await page.waitForFunction(() => !/Reported empty/.test(document.querySelector('#pane-phone [data-testid="cat-ucc-protein"]').innerText), null, { timeout: 8000 });
    const pp = await page.locator('#pane-phone [data-testid="cat-ucc-protein"] .cat-count').innerText();
    check('present step 2: phone shows restock', pp.trim() === '14', pp);
    if (SHOTS) await page.screenshot({ path: path.join(SHOT_DIR, 'present-2.png') });
    await page.click('[data-testid="step-3"]');
    await page.waitForSelector('#pane-phone [data-act="reserve"]', { timeout: 8000 });
    check('present step 3: drop appears on phone', true);
    await page.click('[data-testid="step-4"]');
    await page.waitForSelector('#pane-phone [data-testid^="code-"]', { timeout: 8000 });
    check('present step 4: code on phone', true);
    await page.click('[data-testid="step-5"]');
    await page.waitForSelector('#pane-screen [data-testid="kpi-drops"]');
    await page.waitForTimeout(400);
    const doneCount = await page.locator('.step.done').count();
    check('present: all five steps marked done', doneCount === 5, doneCount);
    if (SHOTS) await page.screenshot({ path: path.join(SHOT_DIR, 'present-5.png') });
    await noOverflow(page, 'present 1440');
    await page.click('[data-testid="reset"]');
    await page.waitForSelector('#pane-phone [data-testid="no-drops"]');
    check('present: reset clears drops and codes', (await page.locator('#pane-phone [data-testid^="code-"]').count()) === 0);
    check('present: no console errors', errors.length === 0, errors);
    await ctx.close();
  }

  /* ---------- mobile + dark, every view ---------- */
  for (const scheme of ['dark', 'light']) {
    const { ctx, page, errors } = await newPage(browser, base, { viewport: { width: 390, height: 844 }, colorScheme: scheme, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    for (const r of ['find', 'restock', 'drops', 'impact', 'present']) {
      await page.goto(base + '#' + r);
      await page.waitForTimeout(250);
      await page.waitForSelector(r === 'present' ? '#pane-phone .card' : '#pane-main .card');
      await noOverflow(page, r + ' 390 ' + scheme);
      if (SHOTS && (scheme === 'dark' || r === 'find')) await page.screenshot({ path: path.join(SHOT_DIR, r + '-mobile-' + scheme + '.png'), fullPage: r !== 'present' });
    }
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    check('mobile ' + scheme + ': body has explicit background', bg && bg !== 'rgba(0, 0, 0, 0)', bg);
    check('mobile ' + scheme + ': no console errors', errors.length === 0, errors);
    await ctx.close();
  }

  /* ---------- cross-tab live sync ---------- */
  {
    const { ctx, page, errors } = await newPage(browser, base, { colorScheme: 'light' });
    await page.goto(base + '#find');
    await page.waitForSelector('[data-testid="point-ucc"]');
    const page2 = await ctx.newPage();
    await page2.goto(base + '#impact');
    await page2.waitForSelector('[data-testid="feed"]');
    await page.click('[data-testid="point-weldon"] [data-act="report-open"]');
    await page.click('[data-testid="point-weldon"] [data-act="report"][data-cat="hygiene"]');
    await page2.waitForFunction(() => /Period & hygiene reported empty at Weldon Point/.test(document.querySelector('[data-testid="feed"]').innerText), null, { timeout: 5000 });
    check('live sync: second tab updates instantly', true);
    check('sync: no console errors', errors.length === 0, errors);
    await ctx.close();
  }

  /* ---------- storage blocked: still works ---------- */
  {
    const { ctx, page, errors } = await newPage(browser, base, { colorScheme: 'light' });
    await page.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } });
      Object.defineProperty(window, 'sessionStorage', { get() { throw new Error('blocked'); } });
    });
    await page.goto(base + '#find');
    await page.waitForSelector('[data-testid="point-ucc"]');
    await page.click('[data-testid="point-ucc"] [data-act="report-open"]');
    await page.click('[data-testid="point-ucc"] [data-act="report"][data-cat="snacks"]');
    await page.waitForFunction(() => /Reported empty/.test(document.querySelector('[data-testid="cat-ucc-snacks"]').innerText));
    check('blocked storage: app still works', true);
    check('blocked storage: no uncaught errors', errors.filter((e) => /pageerror/.test(e)).length === 0, errors);
    await ctx.close();
  }

  await browser.close();
  srv.close();
  const failed = results.filter((r) => !r.ok);
  console.log('\n' + (results.length - failed.length) + '/' + results.length + ' passed');
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
