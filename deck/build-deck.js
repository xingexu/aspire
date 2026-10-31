// PBSN ASPIRE: FoodLink — official-case edition.
// Aspire 2026 case: "Driving Engagement for Western's University Students' Council". Audience: the USC Executive
// Team. The deck answers the case's five asks: initiative + evidence, root causes, use of USC assets, costs and
// funding, timeline + next steps + metrics. Type system: Schibsted Grotesk, 12-column grid, 0.3 in box padding.
'use strict';
const path = require('path');
const fs = require('fs');
const pptxgen = require('pptxgenjs');

const IMG = (f) => path.join(__dirname, 'img', f);
const ASPECT = (f) => { const b = fs.readFileSync(IMG(f)); return b.readUInt32BE(16) / b.readUInt32BE(20); };
const OUT = path.join(__dirname, 'PBSN_ASPIRE_FoodLink.pptx');

const C = {
  paper: 'F7F5EF', white: 'FFFFFF', ink: '15201A', text: '38433C', muted: '68716A', hair: 'D9D4C7', panel: 'EEEADF',
  green: '1D5E40', deep: '113425', greenSoft: 'E1EAE1', brass: 'A97A2F', brassLight: 'D9B26E', red: '9C3B2E', blue: '2E5F7A', grey: 'BDC3BA',
  onDark: 'F7F5EF', onDark2: 'CBD9CE', onDark3: '93AE9C', darkLine: '2F5444',
};
const F = 'Schibsted Grotesk';
const QUOTE = 'Source Serif 4';
const W = 13.333, H = 7.5, M = 0.75, CW = W - 2 * M;
const GUT = 0.25, COL = (CW - 11 * GUT) / 12;
const span = (n) => n * COL + (n - 1) * GUT;
const colX = (i) => M + i * (COL + GUT);
const PAD = 0.3;
const TOP = 2.05;
const SECTIONS = ['Diagnosis', 'Solution', 'Engagement', 'Execution'];
const TEAM = 'Xinge Xu (Zinger)   ·   Nuo Zhang   ·   Zohra Khawaja   ·   Ahana Gehlot';
const NB = ' ';
const THEME = {
  name: 'FoodLink', headFontFace: F, bodyFontFace: F,
  colors: { dk1: C.ink, lt1: C.white, dk2: C.deep, lt2: C.paper, accent1: C.green, accent2: C.brass, accent3: C.blue, accent4: C.red, accent5: C.muted, accent6: C.greenSoft, hlink: C.green, folHlink: C.deep },
};

/* ---------- layouts ---------- */
function footer(current, dark) {
  const y = 6.98;
  const line = dark ? C.darkLine : C.hair, mark = dark ? C.onDark : C.ink, off = dark ? C.onDark3 : C.muted;
  const o = [
    { line: { x: M, y, w: CW, h: 0, line: { color: line, width: 0.75 } } },
    { text: { text: 'FoodLink', options: { x: M, y: y + 0.08, w: 1.6, h: 0.3, fontFace: F, fontSize: 12, bold: true, color: mark, margin: 0, valign: 'middle' } } },
  ];
  const labels = current === 'Appendix' ? ['Appendix'] : SECTIONS;
  const lw = 1.3, gap = 0.12, total = labels.length * lw + (labels.length - 1) * gap;
  let x = (W - total) / 2;
  labels.forEach((l) => {
    const on = l === current;
    if (on) o.push({ rect: { x: x + 0.2, y: y - 0.025, w: lw - 0.4, h: 0.05, fill: { color: C.brass }, line: { color: C.brass, width: 0 } } });
    o.push({ text: { text: l, options: { x, y: y + 0.08, w: lw, h: 0.3, fontFace: F, fontSize: 11, bold: on, color: on ? mark : off, align: 'center', valign: 'middle', margin: 0 } } });
    x += lw + gap;
  });
  return o;
}
const titleBox = (color) => ({ placeholder: { options: { name: 'title', type: 'title', x: M, y: 0.55, w: 11.2, h: 1.3, fontFace: F, fontSize: 34, bold: true, color, align: 'left', valign: 'top', margin: 0, lineSpacingMultiple: 0.95 }, text: '' } });
const NUM = (dark) => ({ x: W - M - 0.8, y: 7.06, w: 0.8, h: 0.3, fontFace: F, fontSize: 11, color: dark ? C.onDark3 : C.muted, align: 'right', valign: 'middle', margin: 0 });

function layouts(pres) {
  pres.defineSlideMaster({ title: 'COVER', background: { color: C.deep }, objects: [] });
  pres.defineSlideMaster({ title: 'PLAIN', background: { color: C.paper }, objects: footer(null).concat([titleBox(C.ink)]), slideNumber: NUM(false) });
  SECTIONS.forEach((s) => pres.defineSlideMaster({ title: s.toUpperCase(), background: { color: C.paper }, objects: footer(s).concat([titleBox(C.ink)]), slideNumber: NUM(false) }));
  pres.defineSlideMaster({ title: 'CLOSE', background: { color: C.deep }, objects: footer(null, true).concat([titleBox(C.onDark)]), slideNumber: NUM(true) });
  pres.defineSlideMaster({ title: 'APPENDIX', background: { color: C.paper }, objects: footer('Appendix').concat([titleBox(C.ink)]), slideNumber: NUM(false) });
}

/* ---------- helpers ---------- */
function T(s, text, o) { s.addText(text, Object.assign({ isTextBox: true, margin: 0, fontFace: F, fontSize: 18, color: C.text, valign: 'top' }, o)); }
function B(s, text, o) { T(s, text, Object.assign({ bold: true, color: C.ink }, o)); }
function title(s, t) { s.addText(t, { placeholder: 'title' }); }
function src(s, t, dark) { T(s, t, { x: M, y: 6.48, w: CW, h: 0.32, fontSize: 11, color: dark ? C.onDark3 : C.muted, valign: 'bottom' }); }
function rect(s, x, y, w, h, fill, lineColor) { s.addShape('rect', { x, y, w, h, fill: { color: fill }, line: { color: lineColor || fill, width: lineColor ? 0.75 : 0 } }); }
function card(s, x, y, w, h, fill) { rect(s, x, y, w, h, fill || C.white, C.hair); }
function hline(s, x, y, w, color, width) { s.addShape('line', { x, y, w, h: 0, line: { color: color || C.hair, width: width || 0.75 } }); }
function vline(s, x, y, h, color, width) { s.addShape('line', { x, y, w: 0, h, line: { color: color || C.hair, width: width || 0.75 } }); }
function brassRule(s, x, y, w) { rect(s, x, y, w || 0.5, 0.05, C.brass); }
function bullets(items, o) { return items.map((t, j) => ({ text: t, options: Object.assign({ bullet: { indent: 16 }, breakLine: j < items.length - 1 }, o || {}) })); }
const NONE = { type: 'none' };
function table(s, rows, o, sizes) {
  const z = Object.assign({ head: 14, body: 16 }, sizes || {});
  const head = rows[0].map((t) => ({ text: t, options: { bold: true, color: C.ink, fontSize: z.head, border: [NONE, NONE, { type: 'solid', pt: 1.25, color: C.ink }, NONE] } }));
  const body = rows.slice(1).map((r) => r.map((t, i) => ({ text: t, options: { color: i === 0 ? C.ink : C.text, bold: i === 0, fontSize: z.body, border: [NONE, NONE, { type: 'solid', pt: 0.75, color: C.hair }, NONE] } })));
  s.addTable([head].concat(body), Object.assign({ fontFace: F, color: C.text, valign: 'middle', margin: [6, 14, 6, 0], fill: { color: C.paper } }, o));
}
function image(s, file, x, y, w, altText) { s.addImage({ path: IMG(file), x, y, w, h: w / ASPECT(file), altText }); return w / ASPECT(file); }
// Label-and-text rows (executive summary style).
function rows(s, items, o) {
  const z = Object.assign({ y: TOP + 0.15, step: 1.15, labelCols: 3, labelSize: 22, textSize: 19 }, o || {});
  items.forEach((r, i) => {
    const y = z.y + i * z.step;
    hline(s, M, y - 0.25, CW, i === 0 ? C.ink : C.hair, i === 0 ? 1.25 : 0.75);
    B(s, r[0], { x: M, y, w: span(z.labelCols), h: 0.5, fontSize: z.labelSize, color: C.green });
    T(s, r[1], { x: colX(z.labelCols), y: y + 0.03, w: span(12 - z.labelCols), h: 0.9, fontSize: z.textSize, color: C.ink });
  });
}

(async () => {
  const pres = new pptxgen();
  pres.layout = 'LAYOUT_WIDE';
  pres.author = 'PBSN ASPIRE team';
  pres.title = 'PBSN ASPIRE: FoodLink';
  pres.theme = { headFontFace: F, bodyFontFace: F };
  layouts(pres);
  const K = { T, B, title, src, rect, card, hline, vline, brassRule, bullets, table, image, rows, C, F, QUOTE, W, H, M, CW, COL, GUT, span, colX, PAD, TOP, NB, ASPECT, IMG };

  /* 1. Cover */
  {
    const s = pres.addSlide({ masterName: 'COVER' });
    T(s, 'Prepared for Azaad Gill, VP Student Engagement, and the USC Executive Team', { x: M, y: 0.72, w: 8.0, h: 0.35, fontSize: 14, color: C.onDark3 });
    brassRule(s, M, 1.82, 0.7);
    B(s, 'PBSN ASPIRE:', { x: M, y: 2.02, w: 7.6, h: 0.65, fontSize: 34, color: C.onDark2 });
    B(s, 'FoodLink', { x: M, y: 2.6, w: 7.6, h: 1.6, fontSize: 112, color: C.onDark });
    T(s, 'Bringing USC Food Support to where students already are.', { x: M, y: 4.38, w: 6.9, h: 0.85, fontSize: 22, color: C.onDark2 });
    hline(s, M, 5.6, 7.0, C.darkLine);
    T(s, 'Team', { x: M, y: 5.76, w: 3, h: 0.3, fontSize: 12, color: C.onDark3 });
    T(s, TEAM, { x: M, y: 6.06, w: 7.6, h: 0.4, fontSize: 16, color: C.onDark });
    const pw = 3.6, ph = pw / ASPECT('cover-phone.png');
    s.addImage({ path: IMG('cover-phone.png'), x: 8.85, y: H - ph, w: pw, h: ph, altText: 'FoodLink on a phone: the Find food tab with live stock counts at the UCC shelf.' });
    s.addNotes('[0:00–0:10] Good afternoon. We’re Xinge, Nuo, Zohra and Ahana. We chose USC Food Support, and our plan is called FoodLink.');
  }

  /* 2. Executive summary */
  {
    const s = pres.addSlide({ masterName: 'PLAIN' });
    title(s, 'We recommend FoodLink to bring USC\nFood Support to where students are');
    rows(s, [
      ['Initiative', 'Food Support Services. Need is broad, use is narrow, and the USC’s 2025–26 Roadmap already calls for raising awareness of it.'],
      ['Root causes', 'Students don’t hear of it when they need it, can reach it 24' + NB + 'hours a week in one basement room, and see it as a last resort.'],
      ['Plan', 'A FoodLink tab in USC Now, walk-up shelves co-run with faculty councils, and sealed surplus from The Spoke and The Wave.'],
      ['Ask', 'An 11-week pilot, January to March 2027: $6,900, with $4,900 from the USC and the rest from councils and a sponsor.'],
    ]);
    s.addNotes('[0:10–0:30] Need for Food Support is broad but use is narrow, and the USC’s roadmap already calls for more awareness. FoodLink brings it to students: a USC Now tab, shelves co-run with faculty councils, and surplus from The Spoke and The Wave. We ask for an eleven-week, $6,900 pilot.');
  }

  /* 3. Why Food Support */
  {
    const s = pres.addSlide({ masterName: 'DIAGNOSIS' });
    title(s, 'Food Support is under-engaged\nrelative to the need it serves');
    T(s, 'Hampers handed out by USC Food Support', { x: M, y: TOP, w: span(7), h: 0.32, fontSize: 15, color: C.muted });
    const base = 5.7, maxH = 2.55, bw = 1.9;
    hline(s, M, base, span(7), C.ink, 1.25);
    [[750, '750', '2022–23', 'Full year', C.grey, M + 0.6], [1700, '1,700+', 'Sept 2023 – mid-March 2024', '6.5 months', C.green, M + 3.6]].forEach((b) => {
      const h = (b[0] / 1700) * maxH;
      rect(s, b[5], base - h, bw, h, b[4]);
      B(s, b[1], { x: b[5] - 0.5, y: base - h - 0.8, w: bw + 1.0, h: 0.72, fontSize: 44, align: 'center', valign: 'bottom' });
      B(s, b[2], { x: b[5] - 0.8, y: base + 0.12, w: bw + 1.6, h: 0.32, fontSize: 15, align: 'center' });
      T(s, b[3], { x: b[5] - 0.8, y: base + 0.44, w: bw + 1.6, h: 0.3, fontSize: 14, color: C.muted, align: 'center' });
    });
    const rx = colX(8), rw = span(4);
    [['40%', 'of Canadian students skipped meals because of cost in 2024'],
      ['1 in 5', 'TMU students used their food bank; 48.5% were food insecure'],
      ['Priority', 'in the USC’s 2025–26 Roadmap: awareness of Food Support']].forEach((f, i) => {
      const y = TOP - 0.05 + i * 1.45;
      if (i > 0) hline(s, rx, y - 0.18, rw);
      B(s, f[0], { x: rx, y, w: rw, h: 0.7, fontSize: 40, color: C.green });
      T(s, f[1], { x: rx, y: y + 0.72, w: rw, h: 0.6, fontSize: 16 });
    });
    src(s, 'Sources: Global News, Mar 15, 2024; CASA, Walking the Tightrope, Mar 2025; The Eyeopener, Oct 27, 2026; Aspire 2026 case.');
    s.addNotes('[0:30–0:55] We chose Food Support because need is broad and use is narrow. Hamper demand more than doubled in 2023–24. Nationally, 40% of students skip meals because of cost; at TMU, half are food insecure but only one in five has used the food bank. And the USC’s roadmap already commits to raising awareness of Food Support.');
  }

  /* 4. Root causes */
  {
    const s = pres.addSlide({ masterName: 'DIAGNOSIS' });
    title(s, 'Four root causes keep students\naway from Food Support');
    const q = [
      ['Awareness', ['First heard of at O-Week, amid overload', 'Its page says requests reopen Sept 2025']],
      ['Access', ['One basement room, 24' + NB + 'hours a week', 'Hampers take 48+ hours, via a locker']],
      ['Relevance', ['Built for a week of groceries, not a lunch', 'Special requests often go unmet']],
      ['Perception', ['TMU: 48.5% food insecure, 20% used it', 'A food bank feels like a last resort']],
    ];
    const bw = span(6), bh = 1.95, rg = 0.2;
    q.forEach((b, i) => {
      const x = colX((i % 2) * 6), y = TOP + Math.floor(i / 2) * (bh + rg);
      card(s, x, y, bw, bh);
      brassRule(s, x + PAD, y + PAD, 0.45);
      B(s, b[0], { x: x + PAD, y: y + PAD + 0.16, w: bw - 2 * PAD, h: 0.45, fontSize: 24 });
      T(s, bullets(b[1]), { x: x + PAD, y: y + 1.0, w: bw - 2 * PAD, h: 0.85, fontSize: 16, color: C.text, paraSpaceAfter: 6 });
    });
    src(s, 'Sources: Aspire 2026 case (Consideration 1); USC Food Support page, checked Oct 31, 2026; The Eyeopener, Oct 27, 2026.');
    s.addNotes('[0:55–1:25] We found four root causes. Awareness: students meet the USC at O-Week, when overload peaks, and the Food Support page still says requests reopen September 2025. Access: one basement room, 24 hours a week, and hampers take at least two days. Relevance: it’s built for a week of groceries, not a missed lunch. Perception: need goes unspoken.');
  }

  /* 5. Insight */
  {
    const s = pres.addSlide({ masterName: 'DIAGNOSIS' });
    title(s, 'The USC closed walk-ins in 2023\nbecause they were hard to organize');
    const qw = span(6);
    rect(s, M, TOP, qw, 3.85, C.panel);
    T(s, '“', { x: M + PAD, y: TOP + 0.05, w: 1.2, h: 1.1, fontFace: QUOTE, fontSize: 110, color: C.brass });
    T(s, [
      { text: 'Walk-ins made it ', options: {} },
      { text: 'incredibly difficult', options: { color: C.green } },
      { text: ' to get food out in an organized way.', options: {} },
    ], { x: M + PAD + 0.05, y: TOP + 1.0, w: qw - 2 * PAD - 0.1, h: 2.0, fontFace: QUOTE, fontSize: 28, italic: true, color: C.ink });
    T(s, 'The USC, quoted in The Gazette, October 4, 2024', { x: M + PAD + 0.05, y: TOP + 3.25, w: qw - 2 * PAD, h: 0.35, fontSize: 14, color: C.muted });
    const rx = colX(6) + 0.2, rw = W - M - rx;
    B(s, 'FoodLink brings walk-up access back with the controls walk-ins lacked:', { x: rx, y: TOP, w: rw, h: 0.75, fontSize: 19 });
    [['Counted restocks', 'Each check-in is logged.'],
      ['Live stock', 'Seen before walking over.'],
      ['One-tap reports', 'Empty shelf alerts a volunteer.'],
      ['Safety checklist', 'Sealed, in date, no fridge.']].forEach((r, i) => {
      const y = TOP + 0.95 + i * 0.73;
      hline(s, rx, y - 0.13, rw);
      B(s, r[0], { x: rx, y, w: 2.15, h: 0.55, fontSize: 17, color: C.green });
      T(s, r[1], { x: rx + 2.25, y, w: rw - 2.25, h: 0.6, fontSize: 17 });
    });
    s.addNotes('[1:25–1:40] One finding shaped our design: the USC closed walk-ins because they were hard to organize. So FoodLink brings walk-up access back with the controls walk-ins lacked: counted restocks, live stock, one-tap reports and a safety checklist.');
  }

  /* 6. Solution */
  {
    const s = pres.addSlide({ masterName: 'SOLUTION' });
    title(s, 'FoodLink brings Food Support to\nstudents in three ways');
    [['Find it', 'A tab in USC Now with live stock, live drops and every food option.'],
      ['Bring it', 'Walk-up shelves in faculty and affiliate buildings, run with their councils.'],
      ['Fuel it', 'Surplus from The Spoke, The Wave and catering, plus sponsored stock.']].forEach((p, i) => {
      const x = colX(i * 4), w = span(4), y = TOP, h = 2.3;
      card(s, x, y, w, h);
      brassRule(s, x + PAD, y + PAD, 0.45);
      B(s, p[0], { x: x + PAD, y: y + PAD + 0.18, w: w - 2 * PAD, h: 0.5, fontSize: 28 });
      T(s, p[1], { x: x + PAD, y: y + 1.12, w: w - 2 * PAD, h: 1.0, fontSize: 17 });
      s.addShape('line', { x: x + w / 2, y: y + h, w: 0, h: 0.5, line: { color: C.muted, width: 1.25, endArrowType: 'triangle' } });
    });
    const dy = TOP + 2.8;
    rect(s, M, dy, CW, 1.5, C.deep);
    B(s, 'USC dashboard', { x: M + PAD + 0.05, y: dy + 0.24, w: 6, h: 0.5, fontSize: 28, color: C.onDark });
    T(s, 'Items taken, waste, restock time, surplus rescued, partners and volunteers. Published weekly.', { x: M + PAD + 0.05, y: dy + 0.84, w: CW - 2 * PAD - 0.1, h: 0.5, fontSize: 18, color: C.onDark2 });
    s.addNotes('[1:40–2:05] FoodLink works in three ways. Find it: a tab in USC Now shows live stock, live drops and every option, so there is no new app. Bring it: walk-up shelves in faculty and affiliate buildings, co-run with their councils. Fuel it: sealed surplus from The Spoke, The Wave and catering. It all feeds one weekly dashboard.');
  }

  /* 7. Demo */
  {
    const s = pres.addSlide({ masterName: 'SOLUTION' });
    title(s, 'Live demo: a report, a restock and\na surplus drop, in real time');
    image(s, 'present-framed.png', M - 0.27, 1.95, span(7) + 0.45,
      'FoodLink live demo: a student\'s phone beside the volunteer, partner and USC views, with the five demo steps along the bottom.');
    const rx = colX(7) + 0.45, rw = W - M - rx;
    ['Student reports an empty shelf', 'Volunteer restocks it', 'Café posts sealed surplus', 'Student reserves with a code', 'USC dashboard updates'].forEach((t, i) => {
      const y = TOP + i * 0.8;
      B(s, String(i + 1), { x: rx, y: y - 0.06, w: 0.45, h: 0.55, fontSize: 28, color: C.brass });
      T(s, t, { x: rx + 0.55, y, w: rw - 0.55, h: 0.62, fontSize: 18, color: C.ink });
    });
    T(s, 'The app’s live demo page after step 4. Dashboard history is simulated.', { x: rx, y: 6.0, w: rw, h: 0.48, fontSize: 12, color: C.muted });
    s.addNotes('[2:05–3:20] LIVE DEMO, 75 seconds. Open the app’s Live demo page and press Reset demo first. The phone is what the FoodLink tab in USC Now would show. Step 1: a student reports the UCC canned protein empty, with no login. Step 2: a volunteer logs a restock; the phone updates and the dashboard records what was taken. Step 3: a café posts twelve sealed sandwiches; imagine The Wave’s catering leftovers. The app checks the food-safety rules first. Step 4: the student reserves one with an anonymous code. Step 5: switch to USC dashboard; every number we just created is there, on top of simulated history. If the network fails, narrate the steps from this screenshot.');
  }

  /* 8. Evidence */
  require('./evidence-slide.js')(pres, K);

  /* 9. Messengers and communities */
  {
    const s = pres.addSlide({ masterName: 'ENGAGEMENT' });
    title(s, 'Students find FoodLink through people\nand places they already trust');
    table(s, [
      ['Community', 'Messenger', 'What they do'],
      ['Faculty and affiliate councils', 'Council reps', 'Host a shelf in their building and keep it stocked'],
      ['Residences', 'Sophs and dons', 'Show FoodLink at floor meetings; QR codes on floor boards'],
      ['Clubs (240+, reaching 17,000)', 'Club executives', 'Post event leftovers as drops; adopt a shelf'],
      ['Online', 'USC Now, Hype Team', 'Push live drops during exam weeks and late nights'],
      ['First-years', 'Sophs at O-Week 2027', 'One FoodLink minute in every soph group'],
    ], { x: M, y: TOP - 0.05, w: CW, colW: [3.45, 2.75, CW - 6.2], rowH: [0.44, 0.56, 0.56, 0.56, 0.56, 0.56] }, { head: 15, body: 16 });
    rect(s, M, 5.55, CW, 0.75, C.greenSoft);
    T(s, [{ text: 'Moments that matter: ', options: { bold: true, color: C.ink } }, { text: 'exam weeks, late nights and weekends, when the UCC room is closed. That is when FoodLink speaks up.' }], { x: M + PAD, y: 5.55, w: CW - 2 * PAD, h: 0.75, fontSize: 17, color: C.ink, valign: 'middle' });
    s.addNotes('[3:40–4:05] For awareness we use messengers students already trust, as the case suggests. Council reps host shelves in their buildings. Sophs and dons show FoodLink on residence floors. Club executives post event leftovers as drops. And USC Now pushes live drops at the moments that matter: exam weeks, late nights and weekends.');
  }

  /* 10. Business ecosystem */
  {
    const s = pres.addSlide({ masterName: 'ENGAGEMENT' });
    title(s, 'USC businesses already reach students\nevery day; FoodLink puts them to work');
    table(s, [
      ['USC unit', 'What it contributes', 'Cost to the USC'],
      ['The Spoke ($4.3M revenue)', 'Sealed surplus as drops; QR on tables; the largest student employer spreads the word', 'Packaging only'],
      ['The Wave and catering ($1.9M)', 'Event and catering leftovers posted as drops', 'None'],
      ['UCC tenants: grocery, pharmacy', 'Sponsor shelf stock and hygiene items', 'Adds sponsor revenue'],
      ['Purple Store', 'A FoodLink tote, so carrying food looks like shopping', 'Sponsor-funded'],
      ['O-Week, PurpleFest, Productions', 'Launch moments that reach every first-year', 'Existing budgets'],
      ['Free the Dot', 'Period products on every FoodLink shelf', 'Existing program'],
    ], { x: M, y: TOP - 0.05, w: CW, colW: [3.55, CW - 5.75, 2.2], rowH: [0.44, 0.66, 0.52, 0.52, 0.52, 0.52, 0.52] }, { head: 15, body: 16 });
    src(s, 'Revenue: USC 2026–27 budget (Aspire 2026 case, Exhibit 4). Each contribution is a proposal to agree with that unit.');
    s.addNotes('[4:05–4:30] The USC’s businesses are its most frequent contact with students, so we put them to work. The Spoke and The Wave post sealed surplus as drops instead of wasting it. UCC tenants sponsor stock. A Purple Store tote makes carrying food look like shopping. O-Week and PurpleFest give launch moments, and Free the Dot stocks period products.');
  }

  /* 11. Grow engagement overall */
  {
    const s = pres.addSlide({ masterName: 'ENGAGEMENT' });
    title(s, 'FoodLink adds engagement instead of\nmoving it between USC services');
    rows(s, [
      ['Complements hampers', 'Shelves cover today; hampers cover the week. The app links to both, and we track hamper requests so they don’t fall.'],
      ['One front door', 'A tab in USC Now, not another app. It lists USC, Western and city options so students pick the right one.'],
      ['Lifts other services', 'Every shelf and the app point to the Peer Support Centre and Free the Dot.'],
      ['Builds participation', 'Volunteers come from clubs and councils. With 16 of 51 Council seats vacant, they are the USC’s next candidates.'],
    ], { y: TOP + 0.15, step: 1.08, labelCols: 4, labelSize: 20, textSize: 18 });
    src(s, 'Council data: Aspire 2026 case (16 of 51 faculty and affiliate seats vacant in October 2026; 24.6% election turnout in February 2026).');
    s.addNotes('[4:30–4:55] The case warns about a crowded campus, so FoodLink adds engagement instead of moving it. Shelves cover today and hampers cover the week, and we track hamper requests. It’s one front door inside USC Now. Every shelf points to Peer Support and Free the Dot. And with 16 Council seats vacant, our volunteers are the USC’s next candidates.');
  }

  /* 12. Budget and funding */
  {
    const s = pres.addSlide({ masterName: 'EXECUTION' });
    title(s, 'The 11-week pilot costs $6,900: under\n20 cents per undergraduate');
    const lines = [['Coordinator (part-time)', 3000, true], ['Shelving and signs', 1100], ['Food stock', 1050], ['Contingency', 600], ['Promotion', 500], ['Hygiene items', 400], ['Volunteer training', 200], ['Hosting', 50]];
    const lx = M, lw = 2.55, bx = lx + lw + 0.1, bmax = 2.2, aw = 0.95;
    T(s, 'Pilot costs', { x: lx, y: TOP, w: 4, h: 0.32, fontSize: 15, color: C.muted });
    lines.forEach((l, i) => {
      const y = TOP + 0.42 + i * 0.4;
      T(s, l[0], { x: lx, y, w: lw, h: 0.36, fontSize: 16, bold: !!l[2], color: C.ink, valign: 'middle' });
      rect(s, bx, y + 0.09, Math.max(0.05, (l[1] / 3000) * bmax), 0.19, l[2] ? C.green : C.grey);
      B(s, '$' + l[1].toLocaleString('en-CA'), { x: bx + bmax + 0.05, y, w: aw, h: 0.36, fontSize: 16, align: 'right', valign: 'middle' });
    });
    const tw = lw + 0.1 + bmax + 0.05 + aw, ty = TOP + 0.42 + lines.length * 0.4 + 0.08;
    hline(s, lx, ty, tw, C.ink, 1.25);
    B(s, 'Total', { x: lx, y: ty + 0.08, w: 2, h: 0.48, fontSize: 18, valign: 'middle' });
    B(s, '$6,900', { x: lx + tw - 2.2, y: ty + 0.04, w: 2.2, h: 0.56, fontSize: 28, align: 'right', valign: 'middle' });
    const rx = colX(6) + 0.25, rw = W - M - rx;
    card(s, rx, TOP, rw, 4.2);
    B(s, 'Who pays for it', { x: rx + PAD, y: TOP + PAD, w: rw - 2 * PAD, h: 0.4, fontSize: 19 });
    [['Student Life budget: $4,900', 'The Student Life fee funds all USC programs.'],
      ['Host councils: $1,000', '$500 each, from their council grant.'],
      ['UCC tenant sponsor: $1,000', 'Shelf stock and hygiene items, to be agreed.'],
      ['In kind', 'Surplus food from The Spoke and The Wave.']].forEach((r, i) => {
      const y = TOP + 0.92 + i * 0.8;
      hline(s, rx + PAD, y - 0.12, rw - 2 * PAD);
      B(s, r[0], { x: rx + PAD, y, w: rw - 2 * PAD, h: 0.3, fontSize: 16, color: C.green });
      T(s, r[1], { x: rx + PAD, y: y + 0.32, w: rw - 2 * PAD, h: 0.34, fontSize: 16, color: C.ink });
    });
    src(s, 'Case Exhibits 1–2. Coordinator: about a third of the $9,000 role the USC funds for Public Arts and for EnviroUSC. Other amounts are our estimates.');
    s.addNotes('[4:55–5:20] The pilot costs $6,900 for eleven weeks, under 20 cents per undergraduate. The biggest line is a part-time coordinator, priced at a third of the USC’s own $9,000 coordinator roles. The Student Life budget covers $4,900; host councils and a UCC tenant sponsor cover the rest, and the food from The Spoke and The Wave is surplus.');
  }

  /* 13. Metrics */
  {
    const s = pres.addSlide({ masterName: 'EXECUTION' });
    title(s, 'We will measure engagement, not just\nfood handed out');
    table(s, [
      ['Goal', 'Metric', 'Pilot target'],
      ['Awareness', 'Know how to get food support (USC Now poll)', '+15 points over January'],
      ['Reach', 'Items taken from shelves; surplus portions rescued', '1,000 items; 150 portions'],
      ['Embedding', 'Councils, clubs and USC units taking part', '2 councils, 10 clubs, 3 units'],
      ['Participation', 'Volunteers recruited; feedback sent through USC Now', '30 volunteers; 100 responses'],
      ['No shifting', 'Hamper requests compared with last winter', 'Not lower'],
      ['Safety', 'Waste; time to restock; incidents', 'Under 5%; under 2 h; zero'],
    ], { x: M, y: TOP - 0.05, w: CW, colW: [2.45, CW - 6.0, 3.55], rowH: 0.5 }, { head: 15, body: 16 });
    T(s, [{ text: 'Decision rule: ', options: { bold: true, color: C.ink } }, { text: 'at week 11, expand if five of the six goals are met. Safety must be one of the five.' }], { x: M, y: 5.65, w: CW, h: 0.5, fontSize: 18 });
    s.addNotes('[5:20–5:45] We will measure engagement, not just food. Awareness from a USC Now poll, aiming fifteen points above January. A thousand items and 150 surplus portions. Two councils, ten clubs, three USC units. Thirty volunteers. Hamper requests must not fall, and safety incidents stay at zero. At week eleven we expand if five of six goals are met.');
  }

  /* 14. Timeline and next steps */
  {
    const s = pres.addSlide({ masterName: 'EXECUTION' });
    title(s, 'Approve in November, pilot in winter,\nlaunch at scale in O-Week 2027');
    const months = ['Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'Sep 2027'];
    const gx = colX(5) + 0.1, gap = 0.05;
    const cw = (W - M - gx - gap * (months.length - 1)) / months.length;
    const cx = (i) => gx + i * (cw + gap);
    months.forEach((m, i) => B(s, m, { x: cx(i), y: TOP - 0.05, w: cw, h: 0.3, fontSize: 13, color: C.muted, align: 'center' }));
    const rws = [
      ['Set up', 'Approval, partners, USC Now tab', 0, 0, C.grey],
      ['Quick win', 'Exam-season drops; baseline poll', 1, 1, C.blue],
      ['Pilot', 'Two shelves and weekly dashboard', 2, 4, C.green],
      ['Decide', 'Review, report, handover', 5, 5, C.brass],
      ['Scale', 'Every first-year at O-Week', 6, 6, C.green],
    ];
    rws.forEach((r, i) => {
      const y = TOP + 0.42 + i * 0.58;
      hline(s, M, y - 0.06, CW, i === 0 ? C.ink : C.hair, i === 0 ? 1.25 : 0.75);
      B(s, r[0], { x: M, y, w: 1.4, h: 0.5, fontSize: 19, valign: 'middle' });
      T(s, r[1], { x: M + 1.45, y, w: gx - M - 1.55, h: 0.5, fontSize: 15, valign: 'middle' });
      const x0 = cx(r[2]), x1 = cx(r[3]) + cw;
      rect(s, x0, y + 0.13, x1 - x0, 0.24, r[4]);
    });
    hline(s, M, TOP + 0.42 + 5 * 0.58 - 0.06, CW);
    rect(s, M, 5.6, CW, 0.75, C.greenSoft);
    T(s, [{ text: 'Next 30 days: ', options: { bold: true, color: C.ink } }, { text: 'name an owner  ·  confirm two host councils  ·  agree surplus rules with The' + NB + 'Spoke and The' + NB + 'Wave  ·  add the FoodLink tab to USC' + NB + 'Now' }], { x: M + PAD, y: 5.6, w: CW - 2 * PAD, h: 0.75, fontSize: 16, color: C.ink, valign: 'middle' });
    s.addNotes('[5:45–6:10] In November we get approval, sign partners and add the USC Now tab. In December’s exams, surplus drops are a quick win, and we take a baseline poll. The pilot runs January to March. In April we report to Council and hand over to next year’s team, and if it works, every first-year meets FoodLink at O-Week 2027.');
  }

  /* 15. Risks */
  {
    const s = pres.addSlide({ masterName: 'EXECUTION' });
    title(s, 'Each of the main risks has a control\nbuilt into the plan');
    table(s, [
      ['Risk', 'Control'],
      ['Turnover every year', 'Councils own their shelves, the coordinator role carries over, and the app keeps every count and the playbook.'],
      ['Shifting, not growing', 'Shelves link to hampers; hamper requests are tracked weekly and must not fall.'],
      ['Food safety', 'Sealed, shelf-stable items on shelves; perishables only as drops, picked up within two hours.'],
      ['Stigma', 'No names or accounts; shelves sit in busy, neutral spots; the tote looks like shopping.'],
      ['No host building', 'Start at the UCC; Weldon needs Western Libraries’ approval.'],
      ['One person empties a shelf', 'A posted guide, two restocks a day, and live counts that show rushes.'],
    ], { x: M, y: TOP - 0.05, w: CW, colW: [3.4, CW - 3.4], rowH: [0.44, 0.66, 0.54, 0.54, 0.54, 0.5, 0.5] }, { head: 15, body: 16 });
    s.addNotes('[6:10–6:30] The biggest risk is turnover, so councils own their shelves, the coordinator role carries over, and the app keeps the records and the playbook. If FoodLink only shifted students from hampers, the weekly numbers would show it. Food safety, stigma and site approval each have a control too.');
  }

  /* 16. Ask */
  {
    const s = pres.addSlide({ masterName: 'CLOSE' });
    title(s, 'Our ask: approve the FoodLink pilot');
    [['$4,900', 'from the USC Student Life budget'], ['2', 'host councils for the first shelves'], ['11', 'weeks, January to March 2027']].forEach((n, i) => {
      const x = colX(i * 4), w = span(4);
      hline(s, x, 1.95, w, C.darkLine);
      B(s, n[0], { x, y: 2.1, w, h: 1.1, fontSize: 64, color: C.brassLight });
      T(s, n[1], { x, y: 3.28, w: w - 0.2, h: 0.7, fontSize: 18, color: C.onDark2 });
    });
    T(s, 'FoodLink keeps everything Food Support does today and brings it to where students already are. The app is already built.', { x: M, y: 4.3, w: CW, h: 0.95, fontSize: 20, color: C.onDark });
    hline(s, M, 5.5, CW, C.darkLine);
    B(s, 'Thank you. We’re happy to take questions.', { x: M, y: 5.66, w: 9, h: 0.5, fontSize: 26, color: C.onDark });
    T(s, TEAM, { x: M, y: 6.22, w: CW, h: 0.36, fontSize: 15, color: C.onDark3 });
    s.addNotes('[6:30–7:00] Our ask: approve an eleven-week pilot with $4,900 from the Student Life budget, two host councils, and introductions to The Spoke, The Wave and a UCC tenant. FoodLink keeps everything Food Support does today and brings it to where students already are, and the app is already built. Thank you; we’re happy to take questions.');
  }

  /* Appendix */
  require('./appendix.js')(pres, K);

  await pres.writeFile({ fileName: OUT });
  if (process.env.APPLY_THEME_JS) {
    const { applyTheme } = require(process.env.APPLY_THEME_JS);
    await applyTheme(OUT, THEME);
  }
  console.log('wrote', OUT);
})().catch((e) => { console.error(e); process.exit(1); });
