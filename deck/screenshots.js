// Light-theme product screenshots for the PBSN ASPIRE deck (premium edition), with the clock fixed at a weekday lunchtime.
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs'), crypto = require('crypto');
const APP = path.join(__dirname, '..', 'app');
const OUT = path.join(__dirname, 'img');
const FONT_DIR = path.join(APP, 'test', 'fonts');
const fontCss = fs.readFileSync(path.join(FONT_DIR, 'fonts.css'), 'utf8');
const URL = 'file://' + path.join(APP, 'dist', 'preview.html');
const T = new Date(2026, 9, 29, 12, 40); // Thursday, Oct 29, 2026, 12:40 p.m.
fs.mkdirSync(OUT, { recursive: true });
async function ctxFor(browser, opts) {
  const ctx = await browser.newContext(Object.assign({ colorScheme: 'light', deviceScaleFactor: 2 }, opts));
  await ctx.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/css', body: fontCss }));
  await ctx.route('https://fonts.gstatic.com/**', (r) => {
    const h = crypto.createHash('md5').update(r.request().url()).digest('hex').slice(0, 16);
    const f = path.join(FONT_DIR, h + '.bin');
    return fs.existsSync(f) ? r.fulfill({ status: 200, contentType: 'font/ttf', body: fs.readFileSync(f) }) : r.fulfill({ status: 404, body: '' });
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.clock.setFixedTime(T);
  return { ctx, page, errors };
}
async function ready(page, sel) {
  await page.waitForSelector(sel);
  await page.evaluate(() => document.fonts.ready);
  const ok = await page.evaluate(async () => {
    await Promise.all(['700 16px "Schibsted Grotesk"', '16px "Schibsted Grotesk"'].map((f) => document.fonts.load(f)));
    const faces = [...document.fonts].filter((f) => f.family.replace(/["']/g, '') === 'Schibsted Grotesk' && f.status === 'loaded');
    return faces.some((f) => f.weight === '700') && faces.some((f) => f.weight === '400');
  });
  if (!ok) throw new Error('Schibsted Grotesk did not load');
}
(async () => {
  const browser = await chromium.launch();
  const all = [];
  // 1. Student phone, 390 x 816 CSS px (deck aspect 560:1171)
  {
    const { ctx, page, errors } = await ctxFor(browser, { viewport: { width: 390, height: 816 }, isMobile: true, hasTouch: true });
    await page.goto(URL + '#find');
    await ready(page, '[data-testid="point-ucc"]');
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: path.join(OUT, 'phone-raw.png') });
    all.push(...errors); await ctx.close();
  }
  // 2. Presenter page after step 4 (1600 x 900 at 1.25 = 2000 x 1125)
  {
    const { ctx, page, errors } = await ctxFor(browser, { viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1.25 });
    await page.goto(URL + '#present');
    await ready(page, '#pane-phone [data-testid="point-ucc"]');
    for (const n of [1, 2, 3]) { await page.click('[data-testid="step-' + n + '"]'); await page.waitForTimeout(n === 1 ? 1600 : 2800); }
    await page.click('[data-testid="step-4"]');
    await page.waitForSelector('#pane-phone [data-testid^="code-"]');
    await page.waitForTimeout(2400);
    await page.evaluate(() => { const t = document.getElementById('toast'); if (t) t.innerHTML = ''; });
    await page.screenshot({ path: path.join(OUT, 'present.png') });
    all.push(...errors); await ctx.close();
  }
  // 3. Dashboard, 1100 x 644 CSS px at 1600 px wide (deck aspect 1600:937)
  {
    const { ctx, page, errors } = await ctxFor(browser, { viewport: { width: 1100, height: 644 }, deviceScaleFactor: 1600 / 1100 });
    await page.goto(URL + '#impact');
    await ready(page, '[data-testid="kpi-items"]');
    await page.evaluate(() => { const h = document.querySelector('.appbar'); if (h) h.style.display = 'none'; window.scrollTo(0, 0); });
    await page.screenshot({ path: path.join(OUT, 'impact.png') });
    all.push(...errors); await ctx.close();
  }
  await browser.close();
  if (all.length) { console.error('page errors', all); process.exit(1); }
  console.log(fs.readdirSync(OUT));
})().catch((e) => { console.error(e); process.exit(1); });
