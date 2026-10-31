// PBSN ASPIRE: FoodLink — premium editorial edition.
// Warm paper slides, Source Serif 4 headlines in two balanced lines, Source Sans 3 text, deep green with a
// brass accent, real product shots with baked-in shadows, and the section tracker along the bottom.
'use strict';
const path = require('path');
const fs = require('fs');
const pptxgen = require('pptxgenjs');

const IMG = (f) => path.join(__dirname, 'img', f);
// Width / height of a PNG, read from its header, so every image keeps its true aspect ratio.
const ASPECT = (f) => { const b = fs.readFileSync(IMG(f)); return b.readUInt32BE(16) / b.readUInt32BE(20); };
const OUT = path.join(__dirname, 'PBSN_ASPIRE_FoodLink.pptx');

const C = {
  paper: 'F7F5EF', white: 'FFFFFF', ink: '15201A', text: '3A453E', muted: '6B746D', hair: 'D9D4C7', panel: 'EEEADF',
  green: '1D5E40', deep: '113425', greenSoft: 'E1EAE1', brass: 'A97A2F', brassLight: 'D9B26E', red: '9C3B2E', blue: '2E5F7A', grey: 'BDC3BA',
  onDark: 'F7F5EF', onDark2: 'CBD9CE', onDark3: '93AE9C', darkLine: '2F5444',
};
const SERIF = 'Source Serif 4';
const SANS = 'Source Sans 3';
const W = 13.333, H = 7.5, M = 0.75, CW = W - 2 * M;
const SECTIONS = ['Problem', 'Solution', 'Model', 'Execution'];
const TEAM = 'Xinge Xu (Zinger)   ·   Nuo Zhang   ·   Zohra Khawaja   ·   Ahana Gehlot';
const THEME = {
  name: 'FoodLink', headFontFace: SERIF, bodyFontFace: SANS,
  colors: { dk1: C.ink, lt1: C.white, dk2: C.deep, lt2: C.paper, accent1: C.green, accent2: C.brass, accent3: C.blue, accent4: C.red, accent5: C.muted, accent6: C.greenSoft, hlink: C.green, folHlink: C.deep },
};

/* ---------- layouts ---------- */
function footer(current, dark) {
  const y = 6.98;
  const line = dark ? C.darkLine : C.hair, mark = dark ? C.onDark : C.ink, off = dark ? C.onDark3 : C.muted;
  const o = [
    { line: { x: M, y, w: CW, h: 0, line: { color: line, width: 0.75 } } },
    { text: { text: 'FoodLink', options: { x: M, y: y + 0.08, w: 1.6, h: 0.3, fontFace: SERIF, fontSize: 12, color: mark, margin: 0, valign: 'middle' } } },
  ];
  const labels = current === 'Appendix' ? ['Appendix'] : SECTIONS;
  const lw = 1.2, gap = 0.12, total = labels.length * lw + (labels.length - 1) * gap;
  let x = (W - total) / 2;
  labels.forEach((l) => {
    const on = l === current;
    if (on) o.push({ rect: { x: x + 0.2, y: y - 0.025, w: lw - 0.4, h: 0.05, fill: { color: C.brass }, line: { color: C.brass, width: 0 } } });
    o.push({ text: { text: l, options: { x, y: y + 0.08, w: lw, h: 0.3, fontFace: SANS, fontSize: 10.5, bold: on, color: on ? mark : off, align: 'center', valign: 'middle', margin: 0 } } });
    x += lw + gap;
  });
  return o;
}
const titleBox = (color) => ({ placeholder: { options: { name: 'title', type: 'title', x: M, y: 0.55, w: 10.6, h: 1.25, fontFace: SERIF, fontSize: 30, bold: false, color, align: 'left', valign: 'top', margin: 0, lineSpacingMultiple: 0.98 }, text: '' } });
const NUM = (dark) => ({ x: W - M - 0.8, y: 7.06, w: 0.8, h: 0.3, fontFace: SANS, fontSize: 10.5, color: dark ? C.onDark3 : C.muted, align: 'right', valign: 'middle', margin: 0 });

function layouts(pres) {
  pres.defineSlideMaster({ title: 'COVER', background: { color: C.deep }, objects: [] });
  pres.defineSlideMaster({ title: 'PLAIN', background: { color: C.paper }, objects: footer(null).concat([titleBox(C.ink)]), slideNumber: NUM(false) });
  SECTIONS.forEach((s) => pres.defineSlideMaster({ title: s.toUpperCase(), background: { color: C.paper }, objects: footer(s).concat([titleBox(C.ink)]), slideNumber: NUM(false) }));
  pres.defineSlideMaster({ title: 'CLOSE', background: { color: C.deep }, objects: footer(null, true).concat([titleBox(C.onDark)]), slideNumber: NUM(true) });
  pres.defineSlideMaster({ title: 'APPENDIX', background: { color: C.paper }, objects: footer('Appendix').concat([titleBox(C.ink)]), slideNumber: NUM(false) });
}

/* ---------- helpers ---------- */
function T(s, text, o) { s.addText(text, Object.assign({ isTextBox: true, margin: 0, fontFace: SANS, fontSize: 16, color: C.text, valign: 'top' }, o)); }
function S(s, text, o) { s.addText(text, Object.assign({ isTextBox: true, margin: 0, fontFace: SERIF, fontSize: 24, color: C.ink, valign: 'top' }, o)); }
function title(s, t) { s.addText(t, { placeholder: 'title' }); }
function src(s, t, dark) { T(s, t, { x: M, y: 6.5, w: CW, h: 0.3, fontSize: 10, color: dark ? C.onDark3 : C.muted, valign: 'bottom' }); }
function rect(s, x, y, w, h, fill, lineColor) { s.addShape('rect', { x, y, w, h, fill: { color: fill }, line: { color: lineColor || fill, width: lineColor ? 0.75 : 0 } }); }
function hline(s, x, y, w, color, width) { s.addShape('line', { x, y, w, h: 0, line: { color: color || C.hair, width: width || 0.75 } }); }
function vline(s, x, y, h, color, width) { s.addShape('line', { x, y, w: 0, h, line: { color: color || C.hair, width: width || 0.75 } }); }
function brassRule(s, x, y, w) { rect(s, x, y, w || 0.5, 0.045, C.brass); }
const NONE = { type: 'none' };
function table(s, rows, o) {
  const head = rows[0].map((t) => ({ text: t, options: { bold: true, color: C.ink, fontSize: 13, border: [NONE, NONE, { type: 'solid', pt: 1.25, color: C.ink }, NONE] } }));
  const body = rows.slice(1).map((r) => r.map((t, i) => ({ text: t, options: { color: i === 0 ? C.ink : C.text, bold: i === 0, border: [NONE, NONE, { type: 'solid', pt: 0.75, color: C.hair }, NONE] } })));
  s.addTable([head].concat(body), Object.assign({
    fontFace: SANS, fontSize: 14, color: C.text, valign: 'middle', margin: [6, 12, 6, 0], fill: { color: C.paper },
  }, o));
}
function image(s, file, x, y, w) { s.addImage({ path: IMG(file), x, y, w, h: w / ASPECT(file) }); return w / ASPECT(file); }

(async () => {
  const pres = new pptxgen();
  pres.layout = 'LAYOUT_WIDE';
  pres.author = 'PBSN ASPIRE team';
  pres.title = 'PBSN ASPIRE: FoodLink';
  pres.theme = { headFontFace: SERIF, bodyFontFace: SANS };
  layouts(pres);

  /* 1. Cover */
  {
    const s = pres.addSlide({ masterName: 'COVER' });
    T(s, 'A proposal to the University Students’ Council, Western University', { x: M, y: 0.72, w: 7.4, h: 0.35, fontSize: 13, color: C.onDark3 });
    brassRule(s, M, 1.82, 0.6);
    S(s, 'PBSN ASPIRE:', { x: M, y: 2.05, w: 7.4, h: 0.7, fontSize: 36, color: C.onDark2 });
    S(s, 'FoodLink', { x: M, y: 2.68, w: 7.4, h: 1.45, fontSize: 96, color: C.onDark });
    T(s, 'Walk-up food access for Western students, with every restock counted.', { x: M, y: 4.3, w: 6.5, h: 0.8, fontSize: 20, color: C.onDark2 });
    hline(s, M, 5.62, 6.9, C.darkLine);
    T(s, 'Team', { x: M, y: 5.78, w: 3, h: 0.3, fontSize: 11, color: C.onDark3 });
    T(s, TEAM, { x: M, y: 6.08, w: 7.4, h: 0.4, fontSize: 15, color: C.onDark });
    const pw = 3.55, ph = pw / ASPECT('cover-phone.png');
    s.addImage({ path: IMG('cover-phone.png'), x: 8.75, y: H - ph, w: pw, h: ph });
    s.addNotes('[0:00–0:10] Good morning. We’re Xinge, Nuo, Zohra and Ahana, and this is FoodLink.');
  }

  /* 2. Executive summary */
  {
    const s = pres.addSlide({ masterName: 'PLAIN' });
    title(s, 'We ask the USC to fund an 11-week\nFoodLink pilot for $2,500');
    const rows = [
      ['Problem', 'Hamper demand more than doubled. Walk-in help is one basement room open 24\u00a0hours a week, and hampers take at least 48 hours.'],
      ['Solution', 'FoodLink: walk-up shelves with live stock in busy buildings, sealed surplus from campus partners, and one app that lists every option. Every restock is counted.'],
      ['Ask', '$2,500 from the USC Grant Fund for one-time pilot costs, a spot in the UCC plus one more building, and one Food Support contact, January to March 2027.'],
    ];
    rows.forEach((r, i) => {
      const y = 2.2 + i * 1.6;
      hline(s, M, y - 0.3, CW, i === 0 ? C.ink : C.hair, i === 0 ? 1 : 0.75);
      S(s, r[0], { x: M, y, w: 2.4, h: 0.5, fontSize: 22, color: C.green });
      T(s, r[1], { x: M + 2.6, y: y + 0.02, w: CW - 2.6, h: 0.95, fontSize: 19, color: C.ink });
    });
    s.addNotes('[0:10–0:30] Demand for USC Food Support more than doubled, but walk-in help is one basement room, 24\u00a0hours a week. FoodLink adds walk-up shelves, partner surplus and one app, and counts every restock. We ask for $2,500, two shelf spots and one Food Support contact.');
  }

  /* 3. Demand */
  {
    const s = pres.addSlide({ masterName: 'PROBLEM' });
    title(s, 'Hamper demand more than doubled\nin about half the time');
    T(s, 'Hampers handed out by USC Food Support', { x: M, y: 2.05, w: 6.6, h: 0.3, fontSize: 13, color: C.muted });
    const base = 5.75, maxH = 2.75, bw = 1.75;
    hline(s, M, base, 6.7, C.ink, 1);
    [[750, '750', '2022–23', 'Full year, 12 months', C.grey, 1.35], [1700, '1,700+', 'Sept 2023 – mid-March 2024', '6.5 months', C.green, 4.2]].forEach((b) => {
      const h = (b[0] / 1700) * maxH;
      rect(s, b[5], base - h, bw, h, b[4]);
      S(s, b[1], { x: b[5] - 0.4, y: base - h - 0.68, w: bw + 0.8, h: 0.6, fontSize: 34, color: C.ink, align: 'center', valign: 'bottom' });
      T(s, b[2], { x: b[5] - 0.7, y: base + 0.12, w: bw + 1.4, h: 0.3, fontSize: 14, bold: true, color: C.ink, align: 'center' });
      T(s, b[3], { x: b[5] - 0.7, y: base + 0.42, w: bw + 1.4, h: 0.3, fontSize: 13, color: C.muted, align: 'center' });
    });
    const rx = 8.35, rw = W - M - rx;
    [['+600%', 'rise in demand the USC reported for 2023'], ['Sept 2023', 'walk-ins closed because of that rise'], ['40%', 'of Canadian post-secondary students skipped meals because of cost in 2024']].forEach((f, i) => {
      const y = 2.0 + i * 1.42;
      if (i > 0) hline(s, rx, y - 0.2, rw);
      S(s, f[0], { x: rx, y, w: rw, h: 0.62, fontSize: 36, color: C.green });
      T(s, f[1], { x: rx, y: y + 0.66, w: rw, h: 0.55, fontSize: 15, color: C.text });
    });
    src(s, 'Sources: Global News, Mar 15, 2024; The Gazette, Oct 4, 2024; CASA, Walking the Tightrope, Mar 2025 (Abacus Data survey of 1,500 students, May 2024).');
    s.addNotes('[0:30–0:52] In 2022–23 the USC handed out about 750 hampers all year. From September 2023 to mid-March 2024: more than 1,700, in about half the time. Demand rose 600% in 2023, and walk-ins closed that September. Nationally, 40% of students skipped meals because of cost in 2024.');
  }

  /* 4. Access narrowed */
  {
    const s = pres.addSlide({ masterName: 'PROBLEM' });
    title(s, 'Today, walk-in help is one basement\nroom, open 24\u00a0hours a week');
    const rows = [
      ['Sept 2023', 'Walk-ins closed after demand rose 600%.'],
      ['Oct 2024', 'The food bank became hamper-only. Its 40 volunteers were replaced by six part-time staff.'],
      ['Feb 2025', 'The proposed 2025–26 USC budget dropped the Food Support Coordinator role.'],
      ['Oct 2026', 'The USC page lists walk-in hours in UCC 40F, Monday to Thursday, 10 to 4, and still says requests reopen Sept 8, 2025.'],
      ['Today', 'Outside those 24\u00a0hours a week, help means an online form, at least 48 hours, and a locker.'],
    ];
    const lx = M + 0.12;
    vline(s, lx, 2.12, 3.75, C.hair, 1.25);
    rows.forEach((r, i) => {
      const y = 2.0 + i * 0.86;
      const last = i === rows.length - 1;
      s.addShape('ellipse', { x: lx - 0.085, y: y + 0.1, w: 0.17, h: 0.17, fill: { color: last ? C.green : C.paper }, line: { color: last ? C.green : C.muted, width: 1.25 } });
      S(s, r[0], { x: M + 0.5, y, w: 1.9, h: 0.42, fontSize: 20, color: last ? C.green : C.ink });
      T(s, r[1], { x: M + 2.45, y: y + 0.03, w: CW - 2.45, h: 0.72, fontSize: 18, color: last ? C.ink : C.text });
    });
    src(s, 'Sources: The Gazette, Oct 4, 2024 and Feb 2025; USC Food Support page, checked Oct 31, 2026 (office hours; “can be filled in as soon as 48 hours”).');
    s.addNotes('[0:52–1:17] Walk-ins closed in September 2023, and in October 2024 the food bank went hamper-only, with six part-time staff replacing forty volunteers. Today the USC page lists walk-in hours again: one basement room, Monday to Thursday, ten to four. It still says requests reopen September 2025. Otherwise it’s an online form and at least 48 hours.');
  }

  /* 5. Frictions */
  {
    const s = pres.addSlide({ masterName: 'PROBLEM' });
    title(s, 'Help exists, but access, supply and\ninformation get in the way');
    const cols = [
      ['Access', ['One room, open 24\u00a0hours a week', 'Closed after 4 p.m. and Fri–Sun', 'Hampers take at least 48 hours']],
      ['Supply', ['Runs entirely on donations', 'None of the 21 USC fee lines for 2026–27 funds it', 'Special requests often go unmet']],
      ['Information', ['Five services, each with its own hours and rules', 'The USC page lists walk-in hours but says requests reopen Sept 2025', 'Nowhere shows what’s in stock']],
    ];
    const gap = 0.45, cw = (CW - 2 * gap) / 3;
    cols.forEach((c, i) => {
      const x = M + i * (cw + gap);
      brassRule(s, x, 2.05, 0.4);
      S(s, c[0], { x, y: 2.22, w: cw, h: 0.5, fontSize: 26, color: C.ink });
      T(s, c[1].map((t, j) => ({ text: t, options: { bullet: { indent: 15 }, breakLine: j < c[1].length - 1 } })), { x, y: 2.95, w: cw - 0.1, h: 2.2, fontSize: 16, color: C.text, paraSpaceAfter: 9 });
    });
    rect(s, M, 5.55, CW, 0.66, C.greenSoft);
    T(s, 'Western publishes no food-insecurity rate of its own, so hamper counts only show the students who asked.', { x: M + 0.28, y: 5.55, w: CW - 0.56, h: 0.66, fontSize: 16, color: C.ink, valign: 'middle' });
    src(s, 'Sources: USC Food Support page (“we are often not able to honour all special requests”) and 2026–27 fee schedule, checked Oct 2026.');
    s.addNotes('[1:17–1:42] Access: one basement room, Monday to Thursday, ten to four, and hampers that take at least 48 hours. Supply: the service runs entirely on donations, none of the 21 USC fee lines funds it, and special requests often go unmet. Information: five services with their own hours and rules, and a page that contradicts itself.');
  }

  /* 6. Insight */
  {
    const s = pres.addSlide({ masterName: 'PROBLEM' });
    title(s, 'The USC closed walk-ins in 2023\nbecause they were hard to organize');
    rect(s, M, 2.0, 5.5, 3.5, C.panel);
    S(s, '“', { x: M + 0.38, y: 1.95, w: 1.2, h: 1.2, fontSize: 110, color: C.brass });
    S(s, [
      { text: 'Walk-ins made it ', options: {} },
      { text: 'incredibly difficult', options: { color: C.green } },
      { text: ' to get food out in an organized way.', options: {} },
    ], { x: M + 0.42, y: 2.95, w: 4.7, h: 1.9, fontSize: 28, italic: true, color: C.ink });
    T(s, 'The USC, quoted in The Gazette, October 4, 2024', { x: M + 0.42, y: 4.9, w: 4.7, h: 0.35, fontSize: 13, color: C.muted });
    const rx = M + 6.05, rw = CW - 6.05;
    T(s, 'FoodLink adds walk-up access with the controls walk-ins lacked:', { x: rx, y: 2.0, w: rw, h: 0.7, fontSize: 18, bold: true, color: C.ink });
    [['Counted restocks', 'Each check-in records what was taken since the last one.'],
      ['Live stock', 'Students see what is on the shelf before they walk over.'],
      ['One-tap reports', 'An empty shelf alerts the volunteer.'],
      ['Safety checklist', 'Sealed, in date, no fridge needed.']].forEach((r, i) => {
      const y = 2.95 + i * 0.78;
      hline(s, rx, y - 0.14, rw);
      T(s, r[0], { x: rx, y, w: 1.9, h: 0.6, fontSize: 16, bold: true, color: C.green });
      T(s, r[1], { x: rx + 1.98, y, w: rw - 1.98, h: 0.62, fontSize: 16, color: C.text });
    });
    s.addNotes('[1:42–2:05] This shaped our design. In 2023 the USC said walk-ins made it incredibly difficult to get food out in an organized way. So FoodLink adds walk-up access with the controls walk-ins lacked: counted restocks, live stock, one-tap reports, and a food-safety checklist at every check-in.');
  }

  /* 7. Solution */
  {
    const s = pres.addSlide({ masterName: 'SOLUTION' });
    title(s, 'FoodLink has three parts that feed\none dashboard the USC can audit');
    const parts = [
      ['Points', 'Two walk-up shelves of sealed, shelf-stable food and hygiene products. No forms, no ID.'],
      ['Drops', 'Campus partners post sealed surplus. Students reserve it with an anonymous code.'],
      ['App', 'Live stock, live drops, and every other option, from USC Food Support to city food banks.'],
    ];
    const gap = 0.4, bw = (CW - 2 * gap) / 3, by = 2.0, bh = 2.0;
    parts.forEach((p, i) => {
      const x = M + i * (bw + gap);
      rect(s, x, by, bw, bh, C.white, C.hair);
      brassRule(s, x + 0.3, by + 0.3, 0.4);
      S(s, p[0], { x: x + 0.3, y: by + 0.45, w: bw - 0.6, h: 0.5, fontSize: 26, color: C.ink });
      T(s, p[1], { x: x + 0.3, y: by + 1.05, w: bw - 0.6, h: 0.85, fontSize: 15.5, color: C.text });
      s.addShape('line', { x: x + bw / 2, y: by + bh, w: 0, h: 0.55, line: { color: C.muted, width: 1, endArrowType: 'triangle' } });
    });
    const dy = by + bh + 0.55;
    rect(s, M, dy, CW, 1.45, C.deep);
    S(s, 'USC dashboard', { x: M + 0.35, y: dy + 0.24, w: 5, h: 0.5, fontSize: 24, color: C.onDark });
    T(s, 'Items taken, items thrown away, time to restock an empty shelf, surplus rescued and active partners. Published weekly.', { x: M + 0.35, y: dy + 0.82, w: CW - 0.7, h: 0.45, fontSize: 16, color: C.onDark2 });
    src(s, 'Surplus exists on campus: Western’s dining halls gave over 7,500 surplus meals to 19 off-campus agencies, May to Oct 2024 (Western News, Oct 25, 2024).');
    s.addNotes('[2:05–2:30] FoodLink has three parts. Points: two walk-up shelves of sealed, shelf-stable food and hygiene products, with no forms and no ID. Drops: campus partners post sealed surplus that students reserve with an anonymous code. And the app shows live stock, live drops and every other option. All three feed one dashboard the USC can audit, published weekly.');
  }

  /* 8. Student flow */
  {
    const s = pres.addSlide({ masterName: 'SOLUTION' });
    title(s, 'A student finds food in three steps,\nwith no form and no name');
    [['Open FoodLink', 'See what is on each shelf right now and when it was last counted.'],
      ['Walk up and take what you need', 'No form, no name, no student number. A posted guide asks for enough for today.'],
      ['Shelf empty? Tap once', 'The volunteer on shift gets the report. Target: restocked within two hours.']].forEach((st, i) => {
      const y = 2.05 + i * 1.38;
      S(s, String(i + 1), { x: M, y: y - 0.08, w: 0.7, h: 0.75, fontSize: 44, color: C.brass });
      T(s, st[0], { x: M + 0.85, y, w: 8.0, h: 0.45, fontSize: 21, bold: true, color: C.ink });
      T(s, st[1], { x: M + 0.85, y: y + 0.5, w: 8.0, h: 0.7, fontSize: 16, color: C.text });
    });
    T(s, 'Screenshot of the working app. Stock counts come from a simulated pilot.', { x: M + 0.85, y: 6.2, w: 7.0, h: 0.3, fontSize: 11.5, color: C.muted });
    const ph = 5.55, pw = ph * ASPECT('phone.png');
    s.addImage({ path: IMG('phone.png'), x: W - M - pw + 0.25, y: 1.2, w: pw, h: ph });
    s.addNotes('[2:30–2:50] Open FoodLink and see what is on each shelf and when it was last counted. Walk up and take what you need: no form, no name. If a shelf is empty, tap once; the volunteer on shift is told. Let me show you.');
  }

  /* 9. Demo */
  {
    const s = pres.addSlide({ masterName: 'SOLUTION' });
    title(s, 'Live demo: a report, a restock and\na surplus drop, in real time');
    const iw = 8.3;
    image(s, 'present-framed.png', M - 0.27, 1.75, iw);
    const rx = M + 8.35, rw = W - M - rx;
    ['A student reports an empty shelf', 'A volunteer restocks it', 'A café posts sealed surplus', 'A student reserves it with a code', 'The USC dashboard updates'].forEach((t, i) => {
      const y = 2.05 + i * 0.8;
      S(s, String(i + 1), { x: rx, y: y - 0.04, w: 0.4, h: 0.5, fontSize: 24, color: C.brass });
      T(s, t, { x: rx + 0.45, y, w: rw - 0.45, h: 0.62, fontSize: 15, color: C.ink });
    });
    T(s, 'The app’s live demo page after step 4. Dashboard history is simulated.', { x: rx, y: 6.05, w: rw, h: 0.45, fontSize: 11.5, color: C.muted });
    s.addNotes('[2:50–4:05] LIVE DEMO, 75 seconds. Open the app’s Live demo page and press Reset demo first. Step 1: on the phone, a student reports the UCC canned protein empty, with no login. Step 2: the volunteer logs a restock; the phone updates and the dashboard records what was taken since the last check. Step 3: a café posts twelve sealed sandwiches; the app checks the food-safety rules before it goes live. Step 4: the student reserves one and gets an anonymous code. Step 5: switch the screen to USC dashboard; every number we just created is there, and the history behind it is simulated. If the network fails, narrate the five steps from this screenshot.');
  }

  /* 10. Evidence */
  require('./evidence-slide.js')(pres, { T, S, title, src, rect, hline, vline, brassRule, table, image, C, SERIF, SANS, W, H, M, CW });

  /* 11. Budget */
  {
    const s = pres.addSlide({ masterName: 'MODEL' });
    title(s, 'The $2,500 request covers only\nwhat USC Grants fund');
    const lines = [['Food seed stock', 1050, true], ['Hygiene products', 400, false], ['Signs, labels and bins', 300, false], ['Contingency', 250, false], ['Promotion', 250, false], ['Food-handler training', 200, false], ['Hosting and domain', 50, false]];
    const lx = M, lw = 2.55, bx = lx + lw + 0.15, bmax = 2.6;
    T(s, 'USC Grant request', { x: lx, y: 2.0, w: 4, h: 0.3, fontSize: 13, color: C.muted });
    lines.forEach((l, i) => {
      const y = 2.38 + i * 0.43;
      T(s, l[0], { x: lx, y, w: lw, h: 0.36, fontSize: 15, bold: l[2], color: C.ink, valign: 'middle' });
      rect(s, bx, y + 0.08, Math.max(0.05, (l[1] / 1050) * bmax), 0.2, l[2] ? C.green : C.grey);
      T(s, '$' + l[1].toLocaleString('en-CA'), { x: bx + bmax + 0.1, y, w: 0.85, h: 0.36, fontSize: 15, bold: true, color: C.ink, align: 'right', valign: 'middle' });
    });
    const ty = 2.38 + lines.length * 0.43 + 0.08;
    hline(s, lx, ty, lw + 0.15 + bmax + 0.95, C.ink, 1);
    T(s, 'Total request', { x: lx, y: ty + 0.08, w: 2.4, h: 0.4, fontSize: 16, bold: true, color: C.ink, valign: 'middle' });
    S(s, '$2,500', { x: bx + bmax - 1.1, y: ty + 0.04, w: 2.05, h: 0.45, fontSize: 22, color: C.ink, align: 'right', valign: 'middle' });
    T(s, [{ text: 'Not requested: ', options: { bold: true, color: C.ink } }, { text: 'borrowed shelving, and our team’s $250 match (10%).' }], { x: lx, y: ty + 0.62, w: lw + 0.15 + bmax + 0.95, h: 0.35, fontSize: 13.5, color: C.text });
    const rx = 7.65, rw = W - M - rx;
    T(s, 'How it fits the USC Grant rules', { x: rx, y: 2.0, w: rw, h: 0.35, fontSize: 16, bold: true, color: C.ink });
    [['Who applies', 'Our team, as enrolled undergraduates. A collaborative may include ineligible partners, such as Food Support.'],
      ['No equipment', 'Equipment purchases aren’t funded, so we borrow shelving from Food Support or the host building.'],
      ['Not ongoing', 'Operating costs aren’t funded. This is an 11-week project with an end date and a final report.'],
      ['10% match', 'Applications are preferred when the applicant adds 10%. Our team commits $250.']].forEach((r, i) => {
      const y = 2.55 + i * 0.9;
      hline(s, rx, y - 0.12, rw);
      T(s, r[0], { x: rx, y, w: 1.45, h: 0.7, fontSize: 14.5, bold: true, color: C.green });
      T(s, r[1], { x: rx + 1.55, y, w: rw - 1.55, h: 0.78, fontSize: 14, color: C.text });
    });
    src(s, 'Source: USC Grants page, westernusc.ca, checked Oct 31, 2026. Line amounts are our estimates; quotes come during preparation. $2.50 per item at 1,000 items.');
    s.addNotes('[4:30–4:58] We built the budget around the USC Grant rules. The fund doesn’t pay for equipment or ongoing costs, so we borrow the shelving and ask only for one-time pilot costs: $2,500, mostly food and hygiene stock. Our team adds a 10% match, which the committee prefers. At 1,000 items that is $2.50 an item.');
  }

  /* 12. Targets */
  {
    const s = pres.addSlide({ masterName: 'MODEL' });
    title(s, 'We will judge the pilot on five\ntargets the app measures itself');
    table(s, [
      ['Target', 'Goal', 'How the app measures it'],
      ['Items taken', '1,000', 'Shelf counts at each check-in'],
      ['Thrown away', 'Under 5%', 'Expired items removed at check-in'],
      ['Empty to restocked', 'Under 2 hours', 'Median time from a report to a restock'],
      ['Surplus partners', '3', 'Partners posting drops'],
      ['Food-safety incidents', '0', 'Incident log'],
    ], { x: M, y: 2.0, w: 7.1, colW: [2.25, 1.45, 3.4], rowH: 0.5 });
    T(s, [{ text: 'Decision rule: ', options: { bold: true, color: C.ink } }, { text: 'at week 11 we continue if four of the five targets are met. With one site only, the items target becomes 500.' }], { x: M, y: 5.25, w: 7.1, h: 0.75, fontSize: 15.5 });
    const iw = 4.75, x = W - M - iw + 0.2;
    const ih = image(s, 'impact-framed.png', x, 1.85, iw);
    rect(s, x + 0.42, 1.85 + ih - 0.05, 1.45, 0.3, C.deep);
    T(s, 'Simulated data', { x: x + 0.42, y: 1.85 + ih - 0.05, w: 1.45, h: 0.3, fontSize: 11, bold: true, color: C.onDark, align: 'center', valign: 'middle' });
    T(s, 'The dashboard in the app. These numbers are a demonstration, not results.', { x: x + 0.42, y: 1.85 + ih + 0.35, w: iw - 0.6, h: 0.5, fontSize: 11.5, color: C.muted });
    s.addNotes('[4:58–5:18] We will judge the pilot on five targets the app measures itself: 1,000 items taken, under five percent thrown away, empty shelves restocked within two hours, three surplus partners, and zero food-safety incidents. At week eleven we continue if four of the five are met.');
  }

  /* 13. Timeline */
  {
    const s = pres.addSlide({ masterName: 'EXECUTION' });
    title(s, 'The pilot runs January to March,\nwith a decision in week 11');
    const gx = M + 5.0, prepW = 1.05, gap = 0.05;
    const wkW = (W - M - gx - prepW - gap * 11) / 11;
    const colX = (i) => (i === 0 ? gx : gx + prepW + gap + (i - 1) * (wkW + gap));
    T(s, 'Nov–Dec', { x: colX(0), y: 1.98, w: prepW, h: 0.3, fontSize: 12, bold: true, color: C.muted, align: 'center' });
    for (let k = 1; k <= 11; k++) T(s, 'W' + k, { x: colX(k), y: 1.98, w: wkW, h: 0.3, fontSize: 12, bold: true, color: C.muted, align: 'center' });
    const rows = [
      ['Prepare', 'Apply mid-November; site 2 and borrowed shelving by Dec 15; volunteers certified', 0, 0, C.grey],
      ['Launch', 'Shelves, QR codes and posters up; first counts', 1, 2, C.green],
      ['Run', 'Restock twice a day; dashboard published weekly', 3, 11, C.green],
      ['Adjust', 'Move stock to where demand is; add partners', 7, 8, C.blue],
      ['Survey', 'Two-question anonymous survey at the shelves', 10, 10, C.blue],
      ['Decide', 'Continue if four of five targets are met; final report', 11, 11, C.brass],
    ];
    rows.forEach((r, i) => {
      const y = 2.42 + i * 0.66;
      hline(s, M, y - 0.06, CW, i === 0 ? C.ink : C.hair, i === 0 ? 1 : 0.75);
      S(s, r[0], { x: M, y, w: 1.2, h: 0.54, fontSize: 18, color: C.ink, valign: 'middle' });
      T(s, r[1], { x: M + 1.25, y, w: 3.65, h: 0.54, fontSize: 12.5, color: C.text, valign: 'middle' });
      const x0 = colX(r[2]), x1 = colX(r[3]) + (r[3] === 0 ? prepW : wkW);
      rect(s, x0, y + 0.15, x1 - x0, 0.24, r[4]);
    });
    hline(s, M, 2.42 + 6 * 0.66 - 0.06, CW);
    src(s, 'USC Grants decide in about 20 business days and fund projects run between Oct 30 and Apr 4. Winter term starts in January 2027.');
    s.addNotes('[5:18–5:38] We apply in November and hear back in about twenty business days. By December 15 we confirm the second site and the shelving. We launch in weeks one and two, adjust in weeks seven and eight, survey in week ten, and decide in week eleven.');
  }

  /* 14. Risks */
  {
    const s = pres.addSlide({ masterName: 'EXECUTION' });
    title(s, 'Each of the six main risks has\na control built into the plan');
    table(s, [
      ['Risk', 'Control'],
      ['Food safety', 'Shelves hold sealed, shelf-stable items only. Perishables go only through Drops, picked up within two hours; chilled items stay in the partner’s fridge. Ontario’s Donation of Food Act, 1994 protects good-faith donors.'],
      ['One person empties a shelf', 'A posted guide asks for enough for today. Live counts show rushes, so stock moves to where demand is.'],
      ['Volunteers drop off', 'Check-ins take 15 minutes. Food Support staff cover gaps; exam weeks get lighter schedules.'],
      ['No second site by Dec 15', 'Run at the UCC alone and halve the items target. Weldon needs Western Libraries’ approval; a second UCC spot needs only the USC.'],
      ['Grant cut or partly funded', 'The committee can fund part of a request. With half, we run one site and keep the same rules and reporting.'],
      ['Privacy and stigma', 'No accounts, names or student numbers. Pickup codes only. Shelves sit in busy, neutral spots.'],
    ], { x: M, y: 1.95, w: CW, colW: [3.0, CW - 3.0], rowH: [0.42, 0.78, 0.55, 0.55, 0.62, 0.55, 0.55] });
    s.addNotes('[5:38–6:05] Each risk has a control. Food safety: sealed, shelf-stable food on the shelves; perishables only through Drops, picked up within two hours. Emptied shelves: a posted guide and live counts. Volunteer drop-off: fifteen-minute check-ins with staff backup. If no second site is approved, we run the UCC alone and halve the target. If the grant is cut, we run one site.');
  }

  /* 15. SWOT */
  {
    const s = pres.addSlide({ masterName: 'EXECUTION' });
    title(s, 'SWOT: strongest on cost and\naccountability, weakest on proof of use');
    const q = [
      ['Strengths', ['Built and working today', 'Anonymous, walk-up access', 'Measures itself at every check-in', '$2,500 for 11 weeks'], C.white],
      ['Weaknesses', ['Shelf-stable food only', 'Depends on volunteers to restock', 'No per-person limit', 'No usage data of our own yet'], C.panel],
      ['Opportunities', ['USC Grant Fund open until March', 'FoodRescue.ca surplus for Food Support', 'Event and catering leftovers', 'Residences and affiliate colleges next'], C.white],
      ['Threats', ['A food-safety incident', 'Theft or vandalism at a shelf', 'Volunteer burnout in exams', 'Second site not approved'], C.panel],
    ];
    const gap = 0.3, cw = (CW - gap) / 2, ch = 2.15;
    q.forEach((b, i) => {
      const x = M + (i % 2) * (cw + gap), y = 1.95 + Math.floor(i / 2) * (ch + 0.25);
      rect(s, x, y, cw, ch, b[2], C.hair);
      S(s, b[0], { x: x + 0.32, y: y + 0.22, w: cw - 0.64, h: 0.45, fontSize: 22, color: C.green });
      T(s, b[1].map((t, j) => ({ text: t, options: { bullet: { indent: 15 }, breakLine: j < b[1].length - 1 } })), { x: x + 0.32, y: y + 0.78, w: cw - 0.64, h: 1.3, fontSize: 15.5, color: C.ink, paraSpaceAfter: 3 });
    });
    s.addNotes('[6:05–6:25] Strengths: it’s built, anonymous, measures itself and costs $2,500. Weaknesses: shelf-stable food only, reliance on volunteers, and no usage data of our own yet, which the pilot exists to produce. Opportunities: the Grant Fund, FoodRescue.ca and residences next. Threats: a safety incident, vandalism and burnout.');
  }

  /* 16. Ask */
  {
    const s = pres.addSlide({ masterName: 'CLOSE' });
    title(s, 'Our ask: fund the FoodLink pilot');
    const nums = [['$2,500', 'from the USC Grant Fund'], ['2', 'shelf locations: the UCC plus one more building'], ['11', 'weeks, January to March 2027']];
    const gap = 0.45, cw = (CW - 2 * gap) / 3;
    nums.forEach((n, i) => {
      const x = M + i * (cw + gap);
      hline(s, x, 1.95, cw, C.darkLine);
      S(s, n[0], { x, y: 2.1, w: cw, h: 1.05, fontSize: 60, color: C.brassLight });
      T(s, n[1], { x, y: 3.2, w: cw - 0.3, h: 0.7, fontSize: 16, color: C.onDark2 });
    });
    T(s, 'FoodLink keeps the USC’s food bank and hampers, and adds walk-up shelves in busy buildings with the accountability the USC asked for. The app is already built.', { x: M, y: 4.35, w: 10.6, h: 0.85, fontSize: 20, color: C.onDark });
    hline(s, M, 5.5, CW, C.darkLine);
    S(s, 'Thank you. We’re happy to take questions.', { x: M, y: 5.68, w: 8, h: 0.45, fontSize: 22, color: C.onDark });
    T(s, TEAM, { x: M, y: 6.2, w: CW, h: 0.35, fontSize: 13, color: C.onDark3 });
    s.addNotes('[6:25–7:00] Our ask is $2,500 from the USC Grant Fund for one-time pilot costs, a spot in the UCC plus one more building, and one Food Support contact for eleven weeks. FoodLink keeps the USC’s food bank and hampers and adds walk-up shelves in busy buildings, with the accountability the USC asked for, and the app is already built. Thank you. We are happy to take questions.');
  }

  /* Appendix */
  require('./appendix.js')(pres, { T, S, title, src, rect, hline, vline, brassRule, table, image, C, SERIF, SANS, W, H, M, CW });

  await pres.writeFile({ fileName: OUT });
  if (process.env.APPLY_THEME_JS) {
    const { applyTheme } = require(process.env.APPLY_THEME_JS);
    await applyTheme(OUT, THEME);
  }
  console.log('wrote', OUT);
})().catch((e) => { console.error(e); process.exit(1); });
