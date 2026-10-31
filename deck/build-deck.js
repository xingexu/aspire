// PBSN ASPIRE: FoodLink — premium edition, v4 type system.
// One grotesk (Schibsted Grotesk) for display and text, bold two-line headlines, a larger type scale
// (body 17–20 pt, numbers 54–72 pt, nothing on a main slide below 11 pt), and boxes on a 12-column grid
// with the same 0.3 in padding everywhere. Warm paper, deep green, brass accent, real product shots.
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
const GUT = 0.25, COL = (CW - 11 * GUT) / 12;          // 12-column grid
const span = (n) => n * COL + (n - 1) * GUT;           // width of n columns
const colX = (i) => M + i * (COL + GUT);               // x of column i (0-based)
const PAD = 0.3;                                        // padding inside every box
const TOP = 2.05;                                       // content starts below the two-line title
const SECTIONS = ['Problem', 'Solution', 'Model', 'Execution'];
const TEAM = 'Xinge Xu (Zinger)   ·   Nuo Zhang   ·   Zohra Khawaja   ·   Ahana Gehlot';
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
  const lw = 1.25, gap = 0.12, total = labels.length * lw + (labels.length - 1) * gap;
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
function image(s, file, x, y, w) { s.addImage({ path: IMG(file), x, y, w, h: w / ASPECT(file) }); return w / ASPECT(file); }
const NB = ' ';

(async () => {
  const pres = new pptxgen();
  pres.layout = 'LAYOUT_WIDE';
  pres.author = 'PBSN ASPIRE team';
  pres.title = 'PBSN ASPIRE: FoodLink';
  pres.theme = { headFontFace: F, bodyFontFace: F };
  layouts(pres);
  const K = { T, B, title, src, rect, card, hline, vline, brassRule, bullets, table, image, C, F, QUOTE, W, H, M, CW, COL, GUT, span, colX, PAD, TOP, NB };

  /* 1. Cover */
  {
    const s = pres.addSlide({ masterName: 'COVER' });
    T(s, 'A proposal to the University Students’ Council, Western University', { x: M, y: 0.72, w: 7.6, h: 0.35, fontSize: 14, color: C.onDark3 });
    brassRule(s, M, 1.82, 0.7);
    B(s, 'PBSN ASPIRE:', { x: M, y: 2.02, w: 7.6, h: 0.65, fontSize: 34, color: C.onDark2 });
    B(s, 'FoodLink', { x: M, y: 2.6, w: 7.6, h: 1.6, fontSize: 112, color: C.onDark });
    T(s, 'Walk-up food access for Western students, with every restock counted.', { x: M, y: 4.38, w: 6.9, h: 0.85, fontSize: 22, color: C.onDark2 });
    hline(s, M, 5.6, 7.0, C.darkLine);
    T(s, 'Team', { x: M, y: 5.76, w: 3, h: 0.3, fontSize: 12, color: C.onDark3 });
    T(s, TEAM, { x: M, y: 6.06, w: 7.6, h: 0.4, fontSize: 16, color: C.onDark });
    const pw = 3.6, ph = pw / ASPECT('cover-phone.png');
    s.addImage({ path: IMG('cover-phone.png'), x: 8.85, y: H - ph, w: pw, h: ph });
    s.addNotes('[0:00–0:10] Good morning. We’re Xinge, Nuo, Zohra and Ahana, and this is FoodLink.');
  }

  /* 2. Executive summary */
  {
    const s = pres.addSlide({ masterName: 'PLAIN' });
    title(s, 'We ask the USC to fund an 11-week\nFoodLink pilot for $2,500');
    [['Problem', 'Hamper demand more than doubled. Walk-in help is one basement room open 24' + NB + 'hours a week, and hampers take at least 48' + NB + 'hours.'],
      ['Solution', 'Walk-up shelves with live stock in busy buildings, sealed partner surplus, and one app for every option. Every restock is counted.'],
      ['Ask', '$2,500 from the USC Grant Fund for one-time pilot costs, a spot in the UCC plus one more building, and one Food Support contact, January to March 2027.']].forEach((r, i) => {
      const y = TOP + 0.15 + i * 1.5;
      hline(s, M, y - 0.25, CW, i === 0 ? C.ink : C.hair, i === 0 ? 1.25 : 0.75);
      B(s, r[0], { x: M, y, w: span(3), h: 0.5, fontSize: 24, color: C.green });
      T(s, r[1], { x: colX(3), y: y + 0.03, w: span(9), h: 1.0, fontSize: 20, color: C.ink });
    });
    s.addNotes('[0:10–0:30] Demand for USC Food Support more than doubled, but walk-in help is one basement room, 24 hours a week. FoodLink adds walk-up shelves, partner surplus and one app, and counts every restock. We ask for $2,500, two shelf spots and one Food Support contact.');
  }

  /* 3. Demand */
  {
    const s = pres.addSlide({ masterName: 'PROBLEM' });
    title(s, 'Hamper demand more than doubled\nin about half the time');
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
    [['+600%', 'rise in demand in 2023'], ['Sept 2023', 'walk-ins closed after that rise'], ['40%', 'of Canadian students skipped meals because of cost in 2024']].forEach((f, i) => {
      const y = TOP - 0.05 + i * 1.45;
      if (i > 0) hline(s, rx, y - 0.18, rw);
      B(s, f[0], { x: rx, y, w: rw, h: 0.7, fontSize: 40, color: C.green });
      T(s, f[1], { x: rx, y: y + 0.72, w: rw, h: 0.6, fontSize: 16, color: C.text });
    });
    src(s, 'Sources: Global News, Mar 15, 2024; The Gazette, Oct 4, 2024; CASA, Walking the Tightrope, Mar 2025 (Abacus Data survey of 1,500 students, May 2024).');
    s.addNotes('[0:30–0:52] In 2022–23 the USC handed out about 750 hampers all year. From September 2023 to mid-March 2024: more than 1,700, in about half the time. Demand rose 600% in 2023, and walk-ins closed that September. Nationally, 40% of students skipped meals because of cost in 2024.');
  }

  /* 4. Access today */
  {
    const s = pres.addSlide({ masterName: 'PROBLEM' });
    title(s, 'Today, walk-in help is one basement\nroom, open 24' + NB + 'hours a week');
    const rows = [
      ['Sept 2023', 'Walk-ins closed after demand rose 600%.'],
      ['Oct 2024', 'Hamper-only. 40 volunteers were replaced by six part-time staff.'],
      ['Feb 2025', 'The proposed USC budget dropped the Food Support Coordinator.'],
      ['Oct 2026', 'The USC page lists walk-in hours in UCC 40F, Mon–Thu, 10 to 4, and still says requests reopen Sept 8, 2025.'],
      ['Today', 'Otherwise: an online form, at least 48' + NB + 'hours, and a locker.'],
    ];
    const lx = M + 0.12;
    vline(s, lx, TOP + 0.12, 3.7, C.hair, 1.5);
    rows.forEach((r, i) => {
      const y = TOP + i * 0.84;
      const last = i === rows.length - 1;
      s.addShape('ellipse', { x: lx - 0.095, y: y + 0.1, w: 0.19, h: 0.19, fill: { color: last ? C.green : C.paper }, line: { color: last ? C.green : C.muted, width: 1.5 } });
      B(s, r[0], { x: M + 0.5, y, w: span(2) + 0.2, h: 0.42, fontSize: 20, color: last ? C.green : C.ink });
      T(s, r[1], { x: colX(3), y: y + 0.02, w: span(9), h: 0.72, fontSize: 18, color: last ? C.ink : C.text });
    });
    src(s, 'Sources: The Gazette, Oct 4, 2024 and Feb 2025; USC Food Support page, checked Oct 31, 2026 (office hours; “can be filled in as soon as 48 hours”).');
    s.addNotes('[0:52–1:17] Walk-ins closed in September 2023, and in October 2024 the food bank went hamper-only, with six part-time staff replacing forty volunteers. Today the USC page lists walk-in hours again: one basement room, Monday to Thursday, ten to four. It still says requests reopen September 2025. Otherwise it’s an online form and at least 48 hours.');
  }

  /* 5. Frictions */
  {
    const s = pres.addSlide({ masterName: 'PROBLEM' });
    title(s, 'Help exists, but access, supply and\ninformation get in the way');
    const cols = [
      ['Access', ['One room, 24' + NB + 'hours a week', 'Closed evenings, Fri–Sun', 'Hampers: 48+ hours']],
      ['Supply', ['Runs entirely on donations', 'No USC fee line funds it', 'Can’t meet special requests']],
      ['Information', ['Five services, five rules', 'Its page contradicts itself', 'No live view of stock']],
    ];
    cols.forEach((c, i) => {
      const x = colX(i * 4), w = span(4);
      card(s, x, TOP, w, 2.85);
      brassRule(s, x + PAD, TOP + PAD, 0.45);
      B(s, c[0], { x: x + PAD, y: TOP + PAD + 0.18, w: w - 2 * PAD, h: 0.5, fontSize: 26 });
      T(s, bullets(c[1]), { x: x + PAD, y: TOP + 1.12, w: w - 2 * PAD, h: 1.55, fontSize: 16, color: C.text, paraSpaceAfter: 12 });
    });
    rect(s, M, TOP + 3.15, CW, 0.8, C.greenSoft);
    T(s, 'Western publishes no food-insecurity rate of its own, so hamper counts only show the students who asked.', { x: M + PAD, y: TOP + 3.15, w: CW - 2 * PAD, h: 0.8, fontSize: 18, color: C.ink, valign: 'middle' });
    src(s, 'Sources: USC Food Support page, checked Oct 31, 2026 (“we are often not able to honour all special requests”); Western 2026–27 fee schedule.');
    s.addNotes('[1:17–1:42] Access: one basement room, Monday to Thursday, ten to four, and hampers that take at least 48 hours. Supply: the service runs entirely on donations, none of the 21 USC fee lines funds it, and special requests often go unmet. Information: five services with their own hours and rules, and a page that contradicts itself.');
  }

  /* 6. Insight */
  {
    const s = pres.addSlide({ masterName: 'PROBLEM' });
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
    B(s, 'FoodLink adds walk-up access with the controls walk-ins lacked:', { x: rx, y: TOP, w: rw, h: 0.75, fontSize: 19 });
    [['Counted restocks', 'Each check-in is logged.'],
      ['Live stock', 'Seen before walking over.'],
      ['One-tap reports', 'Empty shelf alerts a volunteer.'],
      ['Safety checklist', 'Sealed, in date, no fridge.']].forEach((r, i) => {
      const y = TOP + 0.95 + i * 0.73;
      hline(s, rx, y - 0.13, rw);
      B(s, r[0], { x: rx, y, w: 2.15, h: 0.55, fontSize: 17, color: C.green });
      T(s, r[1], { x: rx + 2.25, y, w: rw - 2.25, h: 0.6, fontSize: 17 });
    });
    s.addNotes('[1:42–2:05] This shaped our design. In 2023 the USC said walk-ins made it incredibly difficult to get food out in an organized way. So FoodLink adds walk-up access with the controls walk-ins lacked: counted restocks, live stock, one-tap reports, and a food-safety checklist at every check-in.');
  }

  /* 7. Solution */
  {
    const s = pres.addSlide({ masterName: 'SOLUTION' });
    title(s, 'FoodLink has three parts that feed\none dashboard the USC can audit');
    [['Points', 'Two walk-up shelves of sealed, shelf-stable food. No forms, no ID.'],
      ['Drops', 'Partners post sealed surplus; students reserve it anonymously.'],
      ['App', 'Live stock, live drops and every other food option nearby.']].forEach((p, i) => {
      const x = colX(i * 4), w = span(4), y = TOP, h = 2.25;
      card(s, x, y, w, h);
      brassRule(s, x + PAD, y + PAD, 0.45);
      B(s, p[0], { x: x + PAD, y: y + PAD + 0.18, w: w - 2 * PAD, h: 0.5, fontSize: 28 });
      T(s, p[1], { x: x + PAD, y: y + 1.12, w: w - 2 * PAD, h: 1.0, fontSize: 17 });
      s.addShape('line', { x: x + w / 2, y: y + h, w: 0, h: 0.5, line: { color: C.muted, width: 1.25, endArrowType: 'triangle' } });
    });
    const dy = TOP + 2.75;
    rect(s, M, dy, CW, 1.5, C.deep);
    B(s, 'USC dashboard', { x: M + PAD + 0.05, y: dy + 0.24, w: 6, h: 0.5, fontSize: 28, color: C.onDark });
    T(s, 'Items taken, waste, time to restock, surplus rescued, partners active. Published weekly.', { x: M + PAD + 0.05, y: dy + 0.84, w: CW - 2 * PAD - 0.1, h: 0.5, fontSize: 18, color: C.onDark2 });
    src(s, 'Surplus exists on campus: Western’s dining halls gave over 7,500 surplus meals to 19 off-campus agencies, May to Oct 2024 (Western News, Oct 25, 2024).');
    s.addNotes('[2:05–2:30] FoodLink has three parts. Points: two walk-up shelves of sealed, shelf-stable food and hygiene products, with no forms and no ID. Drops: campus partners post sealed surplus that students reserve with an anonymous code. And the app shows live stock, live drops and every other option. All three feed one dashboard the USC can audit, published weekly.');
  }

  /* 8. Student flow */
  {
    const s = pres.addSlide({ masterName: 'SOLUTION' });
    title(s, 'A student finds food in three steps,\nwith no form and no name');
    [['Open FoodLink', 'See what is on each shelf right now and when it was last counted.'],
      ['Walk up and take what you need', 'No form, no name, no student number. A posted guide asks for enough for today.'],
      ['Shelf empty? Tap once', 'The volunteer on shift is alerted, with a two-hour restock target.']].forEach((st, i) => {
      const y = TOP + i * 1.42;
      B(s, String(i + 1), { x: M, y: y - 0.12, w: 0.8, h: 0.9, fontSize: 56, color: C.brass });
      B(s, st[0], { x: M + 1.0, y, w: 7.9, h: 0.5, fontSize: 24 });
      T(s, st[1], { x: M + 1.0, y: y + 0.52, w: 7.9, h: 0.75, fontSize: 18 });
    });
    T(s, 'Screenshot of the working app. Stock counts come from a simulated pilot.', { x: M + 1.0, y: 6.15, w: 7.2, h: 0.32, fontSize: 12, color: C.muted });
    const ph = 5.65, pw = ph * ASPECT('phone.png');
    s.addImage({ path: IMG('phone.png'), x: W - M - pw + 0.28, y: 1.15, w: pw, h: ph });
    s.addNotes('[2:30–2:50] Open FoodLink and see what is on each shelf and when it was last counted. Walk up and take what you need: no form, no name. If a shelf is empty, tap once; the volunteer on shift is told. Let me show you.');
  }

  /* 9. Demo */
  {
    const s = pres.addSlide({ masterName: 'SOLUTION' });
    title(s, 'Live demo: a report, a restock and\na surplus drop, in real time');
    image(s, 'present-framed.png', M - 0.27, 1.95, span(7) + 0.45);
    const rx = colX(7) + 0.45, rw = W - M - rx;
    ['Student reports an empty shelf', 'Volunteer restocks it', 'Café posts sealed surplus', 'Student reserves with a code', 'USC dashboard updates'].forEach((t, i) => {
      const y = TOP + i * 0.8;
      B(s, String(i + 1), { x: rx, y: y - 0.06, w: 0.45, h: 0.55, fontSize: 28, color: C.brass });
      T(s, t, { x: rx + 0.55, y, w: rw - 0.55, h: 0.62, fontSize: 18, color: C.ink });
    });
    T(s, 'The app’s live demo page after step 4. Dashboard history is simulated.', { x: rx, y: 6.0, w: rw, h: 0.48, fontSize: 12, color: C.muted });
    s.addNotes('[2:50–4:05] LIVE DEMO, 75 seconds. Open the app’s Live demo page and press Reset demo first. Step 1: on the phone, a student reports the UCC canned protein empty, with no login. Step 2: the volunteer logs a restock; the phone updates and the dashboard records what was taken since the last check. Step 3: a café posts twelve sealed sandwiches; the app checks the food-safety rules before it goes live. Step 4: the student reserves one and gets an anonymous code. Step 5: switch the screen to USC dashboard; every number we just created is there, and the history behind it is simulated. If the network fails, narrate the five steps from this screenshot.');
  }

  /* 10. Evidence */
  require('./evidence-slide.js')(pres, K);

  /* 11. Budget */
  {
    const s = pres.addSlide({ masterName: 'MODEL' });
    title(s, 'The $2,500 request covers only\nwhat USC Grants fund');
    const lines = [['Food seed stock', 1050, true], ['Hygiene products', 400, false], ['Signs, labels, bins', 300, false], ['Contingency', 250, false], ['Promotion', 250, false], ['Volunteer training', 200, false], ['Hosting', 50, false]];
    const lx = M, lw = 2.35, bx = lx + lw + 0.1, bmax = 2.35, aw = 0.95;
    T(s, 'USC Grant request', { x: lx, y: TOP, w: 4, h: 0.32, fontSize: 15, color: C.muted });
    lines.forEach((l, i) => {
      const y = TOP + 0.45 + i * 0.44;
      T(s, l[0], { x: lx, y, w: lw, h: 0.38, fontSize: 17, bold: l[2], color: C.ink, valign: 'middle' });
      rect(s, bx, y + 0.1, Math.max(0.05, (l[1] / 1050) * bmax), 0.2, l[2] ? C.green : C.grey);
      B(s, '$' + l[1].toLocaleString('en-CA'), { x: bx + bmax + 0.05, y, w: aw, h: 0.38, fontSize: 17, align: 'right', valign: 'middle' });
    });
    const tw = lw + 0.1 + bmax + 0.05 + aw, ty = TOP + 0.45 + lines.length * 0.44 + 0.08;
    hline(s, lx, ty, tw, C.ink, 1.25);
    B(s, 'Total', { x: lx, y: ty + 0.1, w: 2, h: 0.5, fontSize: 18, valign: 'middle' });
    B(s, '$2,500', { x: lx + tw - 2.2, y: ty + 0.06, w: 2.2, h: 0.56, fontSize: 28, align: 'right', valign: 'middle' });
    const rx = colX(6) + 0.25, rw = W - M - rx;
    card(s, rx, TOP, rw, 4.25);
    B(s, 'How it fits the USC Grant rules', { x: rx + PAD, y: TOP + PAD, w: rw - 2 * PAD, h: 0.4, fontSize: 19 });
    [['Who applies', 'Our team; Food Support joins as a partner.'],
      ['No equipment purchases', 'Shelving is borrowed, not bought.'],
      ['No ongoing costs', 'An 11-week project with a final report.'],
      ['10% match preferred', 'Our team adds $250 of its own.']].forEach((r, i) => {
      const y = TOP + 0.9 + i * 0.82;
      hline(s, rx + PAD, y - 0.12, rw - 2 * PAD);
      B(s, r[0], { x: rx + PAD, y, w: rw - 2 * PAD, h: 0.3, fontSize: 15, color: C.green });
      T(s, r[1], { x: rx + PAD, y: y + 0.32, w: rw - 2 * PAD, h: 0.36, fontSize: 17, color: C.ink });
    });
    src(s, 'Source: USC Grants page, westernusc.ca, checked Oct 31, 2026. Amounts are our estimates. $2.50 per item at 1,000 items.');
    s.addNotes('[4:30–4:58] We built the budget around the USC Grant rules. The fund doesn’t pay for equipment or ongoing costs, so we borrow the shelving and ask only for one-time pilot costs: $2,500, mostly food and hygiene stock. Our team adds a 10% match, which the committee prefers. At 1,000 items that is $2.50 an item.');
  }

  /* 12. Targets */
  {
    const s = pres.addSlide({ masterName: 'MODEL' });
    title(s, 'We will judge the pilot on five\ntargets the app measures itself');
    table(s, [
      ['Target', 'Goal', 'How the app measures it'],
      ['Items taken', '1,000', 'Shelf counts'],
      ['Thrown away', 'Under 5%', 'Expired items removed'],
      ['Empty to restocked', 'Under 2 h', 'Report-to-restock median'],
      ['Surplus partners', '3', 'Partners posting drops'],
      ['Safety incidents', '0', 'Incident log'],
    ], { x: M, y: TOP, w: span(7), colW: [2.45, 1.3, span(7) - 3.75], rowH: 0.52 }, { head: 15, body: 16 });
    T(s, [{ text: 'Decision rule: ', options: { bold: true, color: C.ink } }, { text: 'continue at week 11 if four of the five targets are met. With one site, the items target is 500.' }], { x: M, y: TOP + 3.5, w: span(7), h: 0.75, fontSize: 17 });
    const iw = span(5) + 0.25, x = W - M - iw + 0.2;
    const ih = image(s, 'impact-framed.png', x, 1.9, iw);
    rect(s, x + 0.4, 1.9 + ih - 0.06, 1.6, 0.34, C.deep);
    B(s, 'Simulated data', { x: x + 0.4, y: 1.9 + ih - 0.06, w: 1.6, h: 0.34, fontSize: 12, color: C.onDark, align: 'center', valign: 'middle' });
    T(s, 'The app’s dashboard. A demonstration, not results.', { x: x + 0.4, y: 1.9 + ih + 0.38, w: iw - 0.6, h: 0.35, fontSize: 12, color: C.muted });
    s.addNotes('[4:58–5:18] We will judge the pilot on five targets the app measures itself: 1,000 items taken, under five percent thrown away, empty shelves restocked within two hours, three surplus partners, and zero food-safety incidents. At week eleven we continue if four of the five are met.');
  }

  /* 13. Timeline */
  {
    const s = pres.addSlide({ masterName: 'EXECUTION' });
    title(s, 'The pilot runs January to March,\nwith a decision in week 11');
    const gx = colX(6) - 0.1, prepW = 0.95, gap = 0.04;
    const wkW = (W - M - gx - prepW - gap * 11) / 11;
    const cx = (i) => (i === 0 ? gx : gx + prepW + gap + (i - 1) * (wkW + gap));
    B(s, 'Nov–Dec', { x: cx(0), y: TOP - 0.05, w: prepW, h: 0.3, fontSize: 13, color: C.muted, align: 'center' });
    for (let k = 1; k <= 11; k++) B(s, 'W' + k, { x: cx(k), y: TOP - 0.05, w: wkW, h: 0.3, fontSize: 13, color: C.muted, align: 'center' });
    const rows = [
      ['Prepare', 'Apply in Nov; site and shelving by Dec 15', 0, 0, C.grey],
      ['Launch', 'Shelves, QR codes and posters up', 1, 2, C.green],
      ['Run', 'Restock twice a day; weekly dashboard', 3, 11, C.green],
      ['Adjust', 'Move stock to demand; add partners', 7, 8, C.blue],
      ['Survey', 'Two-question survey at the shelves', 10, 10, C.blue],
      ['Decide', 'Continue if four of five targets are met', 11, 11, C.brass],
    ];
    rows.forEach((r, i) => {
      const y = TOP + 0.42 + i * 0.66;
      hline(s, M, y - 0.06, CW, i === 0 ? C.ink : C.hair, i === 0 ? 1.25 : 0.75);
      B(s, r[0], { x: M, y, w: 1.35, h: 0.56, fontSize: 19, valign: 'middle' });
      T(s, r[1], { x: M + 1.45, y, w: gx - M - 1.55, h: 0.56, fontSize: 15, valign: 'middle' });
      const x0 = cx(r[2]), x1 = cx(r[3]) + (r[3] === 0 ? prepW : wkW);
      rect(s, x0, y + 0.15, x1 - x0, 0.26, r[4]);
    });
    hline(s, M, TOP + 0.42 + 6 * 0.66 - 0.06, CW);
    src(s, 'USC Grants decide in about 20 business days and fund projects run between Oct 30 and Apr 4. Winter term starts in January 2027.');
    s.addNotes('[5:18–5:38] We apply in November and hear back in about twenty business days. By December 15 we confirm the second site and the shelving. We launch in weeks one and two, adjust in weeks seven and eight, survey in week ten, and decide in week eleven.');
  }

  /* 14. Risks */
  {
    const s = pres.addSlide({ masterName: 'EXECUTION' });
    title(s, 'Each of the six main risks has\na control built into the plan');
    table(s, [
      ['Risk', 'Control'],
      ['Food safety', 'Shelves hold sealed, shelf-stable items. Perishables only through Drops, picked up within two hours. Ontario’s Donation of Food Act protects good-faith donors.'],
      ['One person empties a shelf', 'A posted guide asks for enough for today; live counts show rushes.'],
      ['Volunteers drop off', '15-minute check-ins; Food Support staff cover gaps.'],
      ['No second site by Dec 15', 'Run the UCC alone and halve the items target.'],
      ['Grant cut or partly funded', 'Run one site with the same rules and reporting.'],
      ['Privacy and stigma', 'No accounts or names; pickup codes only; busy, neutral spots.'],
    ], { x: M, y: TOP - 0.05, w: CW, colW: [3.4, CW - 3.4], rowH: [0.44, 0.86, 0.56, 0.56, 0.56, 0.56, 0.56] }, { head: 15, body: 17 });
    s.addNotes('[5:38–6:05] Each risk has a control. Food safety: sealed, shelf-stable food on the shelves; perishables only through Drops, picked up within two hours. Emptied shelves: a posted guide and live counts. Volunteer drop-off: fifteen-minute check-ins with staff backup. If no second site is approved, we run the UCC alone and halve the target. If the grant is cut, we run one site.');
  }

  /* 15. SWOT */
  {
    const s = pres.addSlide({ masterName: 'EXECUTION' });
    title(s, 'SWOT: strongest on cost and\naccountability, weakest on proof of use');
    const q = [
      ['Strengths', ['Built and working today', 'Anonymous, walk-up access', 'Measures itself at every check-in', '$2,500 for 11 weeks'], C.white],
      ['Weaknesses', ['Shelf-stable food only', 'Depends on volunteers', 'No per-person limit', 'No usage data of our own yet'], C.panel],
      ['Opportunities', ['USC Grant Fund open until March', 'FoodRescue.ca surplus', 'Event and catering leftovers', 'Residences next'], C.white],
      ['Threats', ['A food-safety incident', 'Theft or vandalism', 'Volunteer burnout in exams', 'Second site not approved'], C.panel],
    ];
    const bw = span(6), bh = 2.08, rg = 0.22;
    q.forEach((b, i) => {
      const x = colX((i % 2) * 6), y = TOP - 0.05 + Math.floor(i / 2) * (bh + rg);
      card(s, x, y, bw, bh, b[2]);
      B(s, b[0], { x: x + PAD, y: y + 0.22, w: bw - 2 * PAD, h: 0.45, fontSize: 24, color: C.green });
      T(s, bullets(b[1]), { x: x + PAD, y: y + 0.78, w: bw - 2 * PAD, h: 1.22, fontSize: 17, color: C.ink, paraSpaceAfter: 2 });
    });
    s.addNotes('[6:05–6:25] Strengths: it’s built, anonymous, measures itself and costs $2,500. Weaknesses: shelf-stable food only, reliance on volunteers, and no usage data of our own yet, which the pilot exists to produce. Opportunities: the Grant Fund, FoodRescue.ca and residences next. Threats: a safety incident, vandalism and burnout.');
  }

  /* 16. Ask */
  {
    const s = pres.addSlide({ masterName: 'CLOSE' });
    title(s, 'Our ask: fund the FoodLink pilot');
    [['$2,500', 'from the USC Grant Fund'], ['2', 'shelf locations: the UCC plus one more building'], ['11', 'weeks, January to March 2027']].forEach((n, i) => {
      const x = colX(i * 4), w = span(4);
      hline(s, x, 1.95, w, C.darkLine);
      B(s, n[0], { x, y: 2.08, w, h: 1.15, fontSize: 72, color: C.brassLight });
      T(s, n[1], { x, y: 3.28, w: w - 0.2, h: 0.7, fontSize: 18, color: C.onDark2 });
    });
    T(s, 'FoodLink keeps the USC’s food bank and hampers, and adds walk-up shelves in busy buildings with the accountability the USC asked for. The app is already built.', { x: M, y: 4.3, w: CW, h: 0.95, fontSize: 20, color: C.onDark });
    hline(s, M, 5.5, CW, C.darkLine);
    B(s, 'Thank you. We’re happy to take questions.', { x: M, y: 5.66, w: 9, h: 0.5, fontSize: 26, color: C.onDark });
    T(s, TEAM, { x: M, y: 6.22, w: CW, h: 0.36, fontSize: 15, color: C.onDark3 });
    s.addNotes('[6:25–7:00] Our ask is $2,500 from the USC Grant Fund for one-time pilot costs, a spot in the UCC plus one more building, and one Food Support contact for eleven weeks. FoodLink keeps the USC’s food bank and hampers and adds walk-up shelves in busy buildings, with the accountability the USC asked for, and the app is already built. Thank you. We are happy to take questions.');
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
