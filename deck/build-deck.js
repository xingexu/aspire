// PBSN ASPIRE: FoodLink. Consulting-style deck: white slides, action titles, one typeface,
// one brand colour, labelled charts, CarePath-style section tracker. Built for Google Slides.
'use strict';
const path = require('path');
const pptxgen = require('pptxgenjs');

const fs = require('fs');
const IMG = (f) => path.join(__dirname, 'img', f);
// Width / height of a PNG, read from its header, so every image keeps its true aspect ratio.
const ASPECT = (f) => { const b = fs.readFileSync(IMG(f)); return b.readUInt32BE(16) / b.readUInt32BE(20); };
const OUT = path.join(__dirname, 'PBSN_ASPIRE_FoodLink.pptx');

const C = {
  white: 'FFFFFF', ink: '1B1F1C', text: '3A423C', muted: '67706A', line: 'D5DBD7', fill: 'F2F4F2',
  green: '1E6B45', greenDark: '17432F', greenSoft: 'E2EFE7', grey: 'B9C2BC', red: 'A8322A', blue: '2C6B8A',
  onDark: 'FFFFFF', onDark2: 'CFE0D5', onDark3: '9EBFAC',
};
const F = 'Source Sans 3';
const W = 13.333, M = 0.6, CW = W - 2 * M;
const SECTIONS = ['Problem', 'Solution', 'Model', 'Execution'];
const TEAM = 'Xinge Xu (Zinger)  ·  Nuo Zhang  ·  Zohra Khawaja  ·  Ahana Gehlot';
const THEME = {
  name: 'FoodLink', headFontFace: F, bodyFontFace: F,
  colors: { dk1: '1B1F1C', lt1: 'FFFFFF', dk2: '17432F', lt2: 'F2F4F2', accent1: '1E6B45', accent2: '2C6B8A', accent3: 'A8322A', accent4: 'B9C2BC', accent5: '67706A', accent6: 'E2EFE7', hlink: '1E6B45', folHlink: '17432F' },
};

function footer(current) {
  const o = [
    { line: { x: M, y: 6.95, w: CW, h: 0, line: { color: C.line, width: 0.75 } } },
    { text: { text: 'FoodLink', options: { x: M, y: 7.02, w: 1.6, h: 0.3, fontFace: F, fontSize: 11, bold: true, color: C.green, margin: 0, valign: 'middle' } } },
  ];
  const labels = current === 'Appendix' ? ['Appendix'] : SECTIONS;
  const lw = 1.25, gap = 0.1, total = labels.length * lw + (labels.length - 1) * gap;
  let x = (W - total) / 2;
  labels.forEach((l) => {
    const on = l === current;
    if (on) o.push({ rect: { x, y: 7.02, w: lw, h: 0.3, fill: { color: C.white }, line: { color: C.ink, width: 0.75 } } });
    o.push({ text: { text: l, options: { x, y: 7.02, w: lw, h: 0.3, fontFace: F, fontSize: 11, bold: on, color: on ? C.ink : C.muted, align: 'center', valign: 'middle', margin: 0 } } });
    x += lw + gap;
  });
  return o;
}
const TITLE = { placeholder: { options: { name: 'title', type: 'title', x: M, y: 0.45, w: CW, h: 1.05, fontFace: F, fontSize: 28, bold: true, color: C.ink, align: 'left', valign: 'top', margin: 0 }, text: '' } };
const NUM = { x: W - M - 0.8, y: 7.02, w: 0.8, h: 0.3, fontFace: F, fontSize: 11, color: C.muted, align: 'right', valign: 'middle', margin: 0 };

function layouts(pres) {
  pres.defineSlideMaster({ title: 'COVER', background: { color: C.greenDark }, objects: [] });
  pres.defineSlideMaster({ title: 'PLAIN', background: { color: C.white }, objects: footer(null).concat([TITLE]), slideNumber: NUM });
  SECTIONS.forEach((s) => pres.defineSlideMaster({ title: s.toUpperCase(), background: { color: C.white }, objects: footer(s).concat([TITLE]), slideNumber: NUM }));
  pres.defineSlideMaster({ title: 'APPENDIX', background: { color: C.white }, objects: footer('Appendix').concat([TITLE]), slideNumber: NUM });
}

function T(s, text, o) {
  s.addText(text, Object.assign({ isTextBox: true, margin: 0, fontFace: F, fontSize: 16, color: C.text, valign: 'top' }, o));
}
function title(s, t) { s.addText(t, { placeholder: 'title' }); }
function src(s, t) { T(s, t, { x: M, y: 6.55, w: CW, h: 0.3, fontSize: 10, color: C.muted }); }
function box(s, x, y, w, h, o) { s.addShape('rect', Object.assign({ x, y, w, h, fill: { color: C.fill }, line: { color: C.fill, width: 0 } }, o)); }
function hline(s, x, y, w, color) { s.addShape('line', { x, y, w, h: 0, line: { color: color || C.line, width: 0.75 } }); }

function table(s, rows, o) {
  const head = rows[0].map((t) => ({ text: t, options: { bold: true, color: C.ink, fill: { color: C.fill } } }));
  const body = rows.slice(1).map((r) => r.map((t, i) => ({ text: t, options: { color: i === 0 ? C.ink : C.text, bold: i === 0 } })));
  s.addTable([head].concat(body), Object.assign({
    fontFace: F, fontSize: 14, color: C.text, valign: 'middle', margin: [5, 8, 5, 8],
    border: { type: 'solid', color: C.line, pt: 0.75 }, fill: { color: C.white },
  }, o));
}

(async () => {
  const pres = new pptxgen();
  pres.layout = 'LAYOUT_WIDE';
  pres.author = 'PBSN ASPIRE team';
  pres.title = 'PBSN ASPIRE: FoodLink';
  pres.theme = { headFontFace: F, bodyFontFace: F };
  layouts(pres);

  /* 1. Cover */
  {
    const s = pres.addSlide({ masterName: 'COVER' });
    T(s, 'A proposal to the University Students’ Council, Western University', { x: M, y: 0.75, w: 10, h: 0.4, fontSize: 16, color: C.onDark2 });
    T(s, 'PBSN ASPIRE: FoodLink', { x: M, y: 2.0, w: CW, h: 1.1, fontSize: 54, bold: true, color: C.onDark });
    T(s, 'Walk-up food access for Western students, with every restock counted', { x: M, y: 3.15, w: 10.5, h: 0.6, fontSize: 24, color: C.onDark2 });
    hline(s, M, 5.25, CW, '3E6B54');
    T(s, 'Team', { x: M, y: 5.45, w: 3, h: 0.3, fontSize: 14, color: C.onDark3 });
    T(s, TEAM, { x: M, y: 5.8, w: CW, h: 0.45, fontSize: 20, color: C.onDark });
    s.addNotes('[0:00–0:10] Good morning. We’re Xinge, Nuo, Zohra and Ahana, and this is FoodLink.');
  }

  /* 2. Executive summary */
  {
    const s = pres.addSlide({ masterName: 'PLAIN' });
    title(s, 'We ask the USC to fund an 11-week FoodLink pilot for $3,500');
    const rows = [
      ['Problem', 'Hamper demand more than doubled while access narrowed to an online form, a wait of at least 48 hours and a pickup locker.'],
      ['Solution', 'FoodLink: walk-up shelves with live stock, sealed surplus from campus partners, and one app that lists every option. Every restock is counted.'],
      ['Ask', '$3,500 from the USC Grant Fund, two shelf locations and one Food Support contact, January to March 2027.'],
    ];
    rows.forEach((r, i) => {
      const y = 2.0 + i * 1.6;
      if (i > 0) hline(s, M, y - 0.3, CW);
      T(s, r[0], { x: M, y, w: 2.2, h: 0.5, fontSize: 20, bold: true, color: C.green });
      T(s, r[1], { x: M + 2.4, y, w: CW - 2.4, h: 1.0, fontSize: 20, color: C.ink });
    });
    s.addNotes('[0:10–0:30] Demand for USC Food Support more than doubled while the ways to reach it narrowed. FoodLink adds walk-up shelves, sealed partner surplus and one app, and it counts every restock. We ask for $3,500, two shelf spots and one Food Support contact for eleven weeks.');
  }

  /* 3. Demand */
  {
    const s = pres.addSlide({ masterName: 'PROBLEM' });
    title(s, 'Hamper demand more than doubled in about half the time');
    const base = 5.75, maxH = 2.95, bw = 1.7;
    const bars = [[750, '2022–23', 'full year (12 months)', C.grey, 1.2], [1700, 'Sept 2023 – mid-March 2024', '6.5 months', C.green, 4.0]];
    hline(s, M, base, 6.6, C.muted);
    bars.forEach((b) => {
      const h = (b[0] / 1700) * maxH;
      s.addShape('rect', { x: b[4], y: base - h, w: bw, h, fill: { color: b[3] }, line: { color: b[3], width: 0 } });
      T(s, b[0] === 1700 ? '1,700+' : '750', { x: b[4] - 0.3, y: base - h - 0.62, w: bw + 0.6, h: 0.55, fontSize: 30, bold: true, color: C.ink, align: 'center', valign: 'bottom' });
      T(s, b[1], { x: b[4] - 0.6, y: base + 0.1, w: bw + 1.2, h: 0.32, fontSize: 14, bold: true, color: C.ink, align: 'center' });
      T(s, b[2], { x: b[4] - 0.6, y: base + 0.4, w: bw + 1.2, h: 0.3, fontSize: 13, color: C.muted, align: 'center' });
    });
    T(s, 'Hampers handed out by USC Food Support', { x: M, y: 1.75, w: 6.6, h: 0.3, fontSize: 14, color: C.muted });
    const rx = 8.0, rw = W - M - rx;
    const facts = [['+600%', 'rise in demand the USC reported for 2023'], ['Sept 2023', 'walk-ins closed because of that rise'], ['24%', 'of people in Canada lived in a food-insecure household in 2025']];
    facts.forEach((f, i) => {
      const y = 1.9 + i * 1.45;
      if (i > 0) hline(s, rx, y - 0.2, rw);
      T(s, f[0], { x: rx, y, w: rw, h: 0.6, fontSize: 30, bold: true, color: C.green });
      T(s, f[1], { x: rx, y: y + 0.6, w: rw, h: 0.6, fontSize: 15, color: C.text });
    });
    src(s, 'Sources: Global News, Mar 15, 2024; The Gazette, Oct 4, 2024; PROOF (University of Toronto), Apr 29, 2026.');
    s.addNotes('[0:30–0:55] In 2022–23 the USC handed out about 750 hampers in the whole year. From September 2023 to mid-March 2024 it handed out more than 1,700, in about half the time. The USC reported demand up 600% in 2023 and closed walk-ins that September. Nationally, a quarter of people live in food-insecure households, and Western does not publish its own rate.');
  }

  /* 4. Access narrowed */
  {
    const s = pres.addSlide({ masterName: 'PROBLEM' });
    title(s, 'As demand rose, the ways students could reach help narrowed');
    const rows = [
      ['Sept 2023', 'Walk-ins closed after demand rose 600%.'],
      ['Oct 2024', 'The food bank became hamper-only. Its 40 volunteers were replaced by six part-time staff.'],
      ['Feb 2025', 'The proposed 2025–26 USC budget dropped the Food Support Coordinator role.'],
      ['Oct 2026', 'The service’s web page still says requests reopen September 8, 2025.'],
      ['Today', 'Students request online, wait at least 48 hours, and collect from a locker or room UCC 40F.'],
    ];
    const lx = M + 0.15;
    s.addShape('line', { x: lx, y: 1.95, w: 0, h: 4.25, line: { color: C.line, width: 1.5 } });
    rows.forEach((r, i) => {
      const y = 1.85 + i * 0.88;
      const last = i === rows.length - 1;
      s.addShape('ellipse', { x: lx - 0.09, y: y + 0.08, w: 0.18, h: 0.18, fill: { color: last ? C.green : C.white }, line: { color: last ? C.green : C.muted, width: 1.25 } });
      T(s, r[0], { x: M + 0.5, y, w: 1.7, h: 0.4, fontSize: 18, bold: true, color: C.ink });
      T(s, r[1], { x: M + 2.3, y, w: CW - 2.3, h: 0.75, fontSize: 18, color: C.text });
    });
    src(s, 'Sources: The Gazette, Oct 4, 2024 and Feb 2025; USC Food Support Services page, checked Oct 31, 2026.');
    s.addNotes('[0:55–1:25] While demand rose, access went the other way. Walk-ins closed in September 2023. In October 2024 the food bank went hamper-only and forty volunteers were replaced by six part-time staff. The proposed 2025–26 budget dropped the coordinator role. And today the service page still tells students that requests reopen September 8, 2025. Getting food now means an online form, at least 48 hours, and a locker.');
  }

  /* 5. Frictions */
  {
    const s = pres.addSlide({ masterName: 'PROBLEM' });
    title(s, 'Help exists, but access, supply and information get in the way');
    const cols = [
      ['Access', ['One room (UCC 40F) or a locker', 'Online form, at least 48 hours', 'Nothing to grab between classes']],
      ['Supply', ['Runs entirely on donations', 'None of the 21 USC fee lines for 2026–27 funds it', 'Special requests often go unmet']],
      ['Information', ['Five services, each with its own hours and rules', 'The USC page still points to September 2025', 'Nowhere shows what is open now']],
    ];
    const cw = (CW - 2 * 0.4) / 3;
    cols.forEach((c, i) => {
      const x = M + i * (cw + 0.4);
      if (i > 0) s.addShape('line', { x: x - 0.2, y: 1.85, w: 0, h: 3.6, line: { color: C.line, width: 0.75 } });
      T(s, c[0], { x, y: 1.85, w: cw, h: 0.45, fontSize: 22, bold: true, color: C.green });
      T(s, c[1].map((t, j) => ({ text: t, options: { bullet: { indent: 16 }, breakLine: j < c[1].length - 1 } })), { x, y: 2.45, w: cw - 0.1, h: 2.9, fontSize: 17, color: C.ink, paraSpaceAfter: 10 });
    });
    box(s, M, 5.7, CW, 0.62, { fill: { color: C.greenSoft }, line: { color: C.greenSoft, width: 0 } });
    T(s, 'Western publishes no food-insecurity rate of its own, so hamper counts only show the students who asked.', { x: M + 0.25, y: 5.7, w: CW - 0.5, h: 0.62, fontSize: 16, color: C.ink, valign: 'middle' });
    src(s, 'Sources: USC Food Support Services page and 2026–27 fee schedule, checked Oct 2026.');
    s.addNotes('[1:25–1:55] Three things get in the way. Access: one room or a locker, and an online form with a wait of at least 48 hours. Supply: the service runs entirely on donations; none of the 21 USC fee lines funds it, so special requests often cannot be met. Information: five services with different hours and rules, and no single place that shows what is open right now.');
  }

  /* 6. Insight */
  {
    const s = pres.addSlide({ masterName: 'PROBLEM' });
    title(s, 'The USC ended walk-ins because they were hard to organize');
    box(s, M, 1.85, 5.4, 3.75);
    T(s, [
      { text: 'Walk-ins made it ', options: {} },
      { text: '“incredibly difficult”', options: { bold: true, color: C.green } },
      { text: ' to get food out in an organized way.', options: {} },
    ], { x: M + 0.4, y: 2.25, w: 4.6, h: 2.3, fontSize: 30, color: C.ink });
    T(s, 'The USC, quoted in The Gazette, October 4, 2024', { x: M + 0.4, y: 4.85, w: 4.6, h: 0.4, fontSize: 14, color: C.muted });
    const rx = M + 5.9, rw = CW - 5.9;
    T(s, 'FoodLink keeps walk-up access and adds the controls walk-ins lacked:', { x: rx, y: 1.85, w: rw, h: 0.7, fontSize: 18, bold: true, color: C.ink });
    const rows = [
      ['Counted restocks', 'Each check-in records what was taken since the last one.'],
      ['Live stock', 'Students see what is on the shelf before they walk over.'],
      ['One-tap reports', 'An empty shelf alerts the volunteer on shift.'],
      ['Safety checklist', 'Sealed, in date, and nothing that needs a fridge.'],
    ];
    rows.forEach((r, i) => {
      const y = 2.75 + i * 0.78;
      hline(s, rx, y - 0.12, rw);
      T(s, r[0], { x: rx, y, w: 2.1, h: 0.55, fontSize: 16, bold: true, color: C.green });
      T(s, r[1], { x: rx + 2.2, y, w: rw - 2.2, h: 0.6, fontSize: 16, color: C.text });
    });
    s.addNotes('[1:55–2:20] This shaped our design. The USC did not end walk-ins by accident: it said they made it incredibly difficult to get food out in an organized way. So FoodLink keeps walk-up access and adds what walk-ins lacked: every restock is counted, students see live stock, an empty shelf is reported in one tap, and every check-in includes a food-safety checklist.');
  }

  /* 7. Solution */
  {
    const s = pres.addSlide({ masterName: 'SOLUTION' });
    title(s, 'FoodLink has three parts that feed one dashboard the USC can audit');
    const parts = [
      ['Points', 'Two walk-up shelves of sealed, shelf-stable food and hygiene products. No forms, no ID.'],
      ['Drops', 'Campus partners post sealed surplus. Students reserve with an anonymous code.'],
      ['App', 'Live stock, live drops, USC hampers and city food banks with hours and rules.'],
    ];
    const bw = (CW - 2 * 0.45) / 3, by = 1.85, bh = 1.85;
    parts.forEach((p, i) => {
      const x = M + i * (bw + 0.45);
      s.addShape('rect', { x, y: by, w: bw, h: bh, fill: { color: C.white }, line: { color: C.line, width: 1 } });
      T(s, p[0], { x: x + 0.25, y: by + 0.2, w: bw - 0.5, h: 0.45, fontSize: 22, bold: true, color: C.green });
      T(s, p[1], { x: x + 0.25, y: by + 0.75, w: bw - 0.5, h: 1.0, fontSize: 16, color: C.text });
      s.addShape('line', { x: x + bw / 2, y: by + bh + 0.08, w: 0, h: 0.55, line: { color: C.muted, width: 1.25, endArrowType: 'triangle' } });
    });
    const dy = by + bh + 0.75;
    s.addShape('rect', { x: M, y: dy, w: CW, h: 1.35, fill: { color: C.greenSoft }, line: { color: C.greenSoft, width: 0 } });
    T(s, 'USC dashboard', { x: M + 0.3, y: dy + 0.18, w: 4, h: 0.4, fontSize: 20, bold: true, color: C.ink });
    T(s, 'Items taken, items thrown away, time to restock an empty shelf, surplus rescued and active partners. Published weekly.', { x: M + 0.3, y: dy + 0.62, w: CW - 0.6, h: 0.6, fontSize: 16, color: C.ink });
    s.addNotes('[2:20–2:50] FoodLink has three parts. Points are two walk-up shelves of sealed, shelf-stable food and hygiene products, with no forms and no ID. Drops let campus partners post sealed surplus that students reserve with an anonymous code. The app shows live stock, live drops, and every other option, including the USC hampers and city food banks. All three feed one dashboard the USC can audit, published weekly.');
  }

  /* 8. Student flow */
  {
    const s = pres.addSlide({ masterName: 'SOLUTION' });
    title(s, 'A student finds food in three steps, with no form and no name');
    const steps = [
      ['Open FoodLink', 'See what is on each shelf right now and when it was last counted.'],
      ['Walk up and take what you need', 'No form, no name, no student number. A posted guide asks for enough for today.'],
      ['Shelf empty? Tap once', 'The volunteer on shift gets the report. Target: restocked within two hours.'],
    ];
    steps.forEach((st, i) => {
      const y = 1.95 + i * 1.4;
      T(s, String(i + 1), { x: M, y, w: 0.6, h: 0.6, fontSize: 30, bold: true, color: C.green });
      T(s, st[0], { x: M + 0.75, y, w: 8.0, h: 0.45, fontSize: 20, bold: true, color: C.ink });
      T(s, st[1], { x: M + 0.75, y: y + 0.48, w: 8.0, h: 0.7, fontSize: 16, color: C.text });
    });
    const ph = 4.75, pw = ph * ASPECT('phone.png');
    s.addImage({ path: IMG('phone.png'), x: W - M - pw - 0.4, y: 1.8, w: pw, h: ph });
    T(s, 'Screenshot of the working app. Stock counts come from a simulated pilot.', { x: M, y: 6.15, w: 7.6, h: 0.3, fontSize: 12, color: C.muted });
    s.addNotes('[2:50–3:15] Open FoodLink and see what is on each shelf and when it was last counted. Walk up and take what you need: no form, no name, no student number. If a shelf is empty, tap once; the volunteer on shift is told, and we aim to restock within two hours. Let me show you.');
  }

  /* 9. Demo */
  {
    const s = pres.addSlide({ masterName: 'SOLUTION' });
    title(s, 'Live demo: a report, a restock and a surplus drop, updating in real time');
    const iw = 8.3, ih = iw / ASPECT('present.png');
    s.addImage({ path: IMG('present.png'), x: M, y: 1.75, w: iw, h: ih });
    s.addShape('rect', { x: M, y: 1.75, w: iw, h: ih, fill: { color: C.white, transparency: 100 }, line: { color: C.line, width: 0.75 } });
    const rx = M + iw + 0.4, rw = CW - iw - 0.4;
    ['A student reports an empty shelf', 'A volunteer restocks it', 'A café posts sealed surplus', 'A student reserves it with a code', 'The USC dashboard updates'].forEach((t, i) => {
      const y = 1.8 + i * 0.86;
      T(s, String(i + 1), { x: rx, y, w: 0.4, h: 0.45, fontSize: 20, bold: true, color: C.green });
      T(s, t, { x: rx + 0.45, y, w: rw - 0.45, h: 0.7, fontSize: 16, color: C.ink });
    });
    T(s, 'The app’s live demo page, after step 4.', { x: rx, y: 6.2, w: rw, h: 0.3, fontSize: 12, color: C.muted });
    s.addNotes('[3:15–4:30] LIVE DEMO, 75 seconds. Open the app’s Live demo page and press Reset demo first. Step 1: on the phone, a student reports the UCC canned protein empty, with no login. Step 2: the volunteer logs a restock; the phone updates and the dashboard records what was taken since the last check. Step 3: a café posts twelve sealed sandwiches; the app checks the food-safety rules before it goes live. Step 4: the student reserves one and gets an anonymous code. Step 5: switch the screen to USC dashboard; every number we just created is there. If the network fails, narrate the five steps from this screenshot.');
  }

  /* 10. Budget */
  {
    const s = pres.addSlide({ masterName: 'MODEL' });
    title(s, 'The $3,500 pilot fits USC Grant rules, with food capped at 30%');
    const lines = [
      ['Shelves and signage (2)', 1100, false], ['Food seed stock', 1050, true], ['Contingency', 450, false], ['Hygiene products', 400, false],
      ['Promotion', 250, false], ['Food-handler training', 200, false], ['Hosting and domain', 50, false],
    ];
    const lx = M, lw = 2.6, bx = lx + lw + 0.15, bmax = 3.1;
    lines.forEach((l, i) => {
      const y = 1.85 + i * 0.55;
      T(s, l[0], { x: lx, y, w: lw, h: 0.4, fontSize: 15, bold: l[2], color: C.ink, valign: 'middle' });
      s.addShape('rect', { x: bx, y: y + 0.09, w: Math.max(0.05, (l[1] / 1100) * bmax), h: 0.24, fill: { color: l[2] ? C.green : C.grey }, line: { color: l[2] ? C.green : C.grey, width: 0 } });
      T(s, '$' + l[1].toLocaleString('en-CA'), { x: bx + bmax + 0.1, y, w: 0.95, h: 0.4, fontSize: 15, bold: true, color: C.ink, align: 'right', valign: 'middle' });
    });
    hline(s, lx, 5.8, lw + 0.15 + bmax + 1.05, C.muted);
    T(s, 'Total', { x: lx, y: 5.88, w: 2, h: 0.4, fontSize: 16, bold: true, color: C.ink, valign: 'middle' });
    T(s, '$3,500', { x: bx + bmax - 0.9, y: 5.88, w: 1.95, h: 0.4, fontSize: 18, bold: true, color: C.ink, align: 'right', valign: 'middle' });
    const rx = 8.2, rw = W - M - rx;
    [['30%', 'USC Grants cap food at 30% of a grant. Partners, food drives and Food Support supply the rest.'],
      ['$3.50', 'Pilot cost per item at 1,000 items. Shelves and app carry over after week 11.'],
      ['$100K', 'About this much in the USC Grant Fund each year, open on a rolling basis until March.']].forEach((f, i) => {
      const y = 1.85 + i * 1.5;
      if (i > 0) hline(s, rx, y - 0.2, rw);
      T(s, f[0], { x: rx, y, w: rw, h: 0.55, fontSize: 28, bold: true, color: C.green });
      T(s, f[1], { x: rx, y: y + 0.55, w: rw, h: 0.8, fontSize: 15, color: C.text });
    });
    src(s, 'Line amounts are our estimates; quotes come during preparation. USC Grants rules: westernusc.ca, checked Oct 31, 2026.');
    s.addNotes('[4:30–5:00] The biggest line is two shelves and signage. Food is capped at thirty percent because that is the USC Grants rule, so partners, food drives and Food Support supply the rest. At our target of 1,000 items that is $3.50 per item, and the shelves and the app carry over. The Grant Fund holds about $100,000 a year and accepts applications until March, so this can start in January.');
  }

  /* 11. Targets */
  {
    const s = pres.addSlide({ masterName: 'MODEL' });
    title(s, 'We will judge the pilot on five targets the app measures itself');
    table(s, [
      ['Target', 'Goal', 'How the app measures it'],
      ['Items taken', '1,000', 'Shelf counts at each check-in'],
      ['Thrown away', 'Under 5%', 'Expired items removed at check-in'],
      ['Empty to restocked', 'Under 2 hours', 'Median time from a report to a restock'],
      ['Surplus partners', '3', 'Partners posting drops'],
      ['Food-safety incidents', '0', 'Incident log'],
    ], { x: M, y: 1.85, w: 7.4, colW: [2.2, 1.5, 3.7], rowH: 0.52 });
    T(s, [{ text: 'Decision rule: ', options: { bold: true, color: C.ink } }, { text: 'at week 11 we continue if four of the five targets are met.' }], { x: M, y: 5.2, w: 7.4, h: 0.6, fontSize: 16 });
    const iw = 4.25, ih = iw / ASPECT('impact.png');
    s.addImage({ path: IMG('impact.png'), x: W - M - iw, y: 1.85, w: iw, h: ih });
    s.addShape('rect', { x: W - M - iw, y: 1.85, w: iw, h: ih, fill: { color: C.white, transparency: 100 }, line: { color: C.line, width: 0.75 } });
    T(s, 'The dashboard in the app, shown with simulated pilot data.', { x: W - M - iw, y: 1.95 + ih, w: iw, h: 0.5, fontSize: 12, color: C.muted });
    s.addNotes('[5:00–5:25] We will judge the pilot on five targets: 1,000 items taken, under five percent thrown away, empty shelves restocked within two hours, three surplus partners, and zero food-safety incidents. The app measures all five; this is its dashboard with simulated data. The decision rule is set now: at week eleven we continue if four of the five are met.');
  }

  /* 12. Timeline */
  {
    const s = pres.addSlide({ masterName: 'EXECUTION' });
    title(s, 'The pilot runs January to March, with a go/no-go decision in week 11');
    const gx = M + 4.9, prepW = 1.05, gap = 0.05;
    const wkW = (W - M - gx - prepW - gap * 11) / 11;
    const colX = (i) => (i === 0 ? gx : gx + prepW + gap + (i - 1) * (wkW + gap));
    T(s, 'Nov–Dec', { x: colX(0), y: 1.8, w: prepW, h: 0.3, fontSize: 12, bold: true, color: C.muted, align: 'center' });
    for (let k = 1; k <= 11; k++) T(s, 'W' + k, { x: colX(k), y: 1.8, w: wkW, h: 0.3, fontSize: 12, bold: true, color: C.muted, align: 'center' });
    const rows = [
      ['Prepare', 'Grant, two sites, Food Support agreement, volunteers certified, partners signed', 0, 0, C.grey],
      ['Launch', 'Shelves, QR codes and posters up; first counts', 1, 2, C.green],
      ['Run', 'Restock twice a day; dashboard published weekly', 3, 11, C.green],
      ['Adjust', 'Move stock to where demand is; add partners', 7, 8, C.blue],
      ['Survey', 'Two-question anonymous survey at the shelves', 10, 10, C.blue],
      ['Decide', 'Go or stop against the five targets', 11, 11, C.ink],
    ];
    rows.forEach((r, i) => {
      const y = 2.25 + i * 0.68;
      hline(s, M, y - 0.06, CW);
      T(s, r[0], { x: M, y, w: 1.1, h: 0.56, fontSize: 16, bold: true, color: C.ink, valign: 'middle' });
      T(s, r[1], { x: M + 1.15, y, w: 3.6, h: 0.56, fontSize: 13, color: C.text, valign: 'middle' });
      const x0 = colX(r[2]), x1 = colX(r[3]) + (r[3] === 0 ? prepW : wkW);
      s.addShape('rect', { x: x0, y: y + 0.15, w: x1 - x0, h: 0.26, fill: { color: r[4] }, line: { color: r[4], width: 0 } });
    });
    hline(s, M, 2.25 + 6 * 0.68 - 0.06, CW);
    src(s, 'Assumes a grant decision in November and a Winter term that starts in January 2027.');
    s.addNotes('[5:25–5:50] November and December we prepare: the grant, two sites, a Food Support agreement, certified volunteers and three partners. Weeks one and two we launch. From week three the shelves run, restocked twice a day, with the dashboard published weekly. Weeks seven and eight we adjust, week ten we run a two-question survey, and week eleven we decide.');
  }

  /* 13. Risks */
  {
    const s = pres.addSlide({ masterName: 'EXECUTION' });
    title(s, 'Each of the five main risks has a control built into the design');
    table(s, [
      ['Risk', 'Control'],
      ['Food safety', 'Shelves hold sealed, shelf-stable items only. Perishables go only through Drops: sealed, labelled, picked up within two hours, chilled items kept in the partner’s fridge. Ontario’s Donation of Food Act, 1994 protects good-faith donors.'],
      ['One person empties a shelf', 'A posted guide asks for enough for today. Live counts show rushes, so stock moves to where demand is.'],
      ['Volunteers drop off', 'Check-ins take 15 minutes. Food Support staff cover gaps, and exam weeks get lighter schedules.'],
      ['Information goes stale', 'Every listing shows when it was checked. Anything older than 30 days is flagged in the app.'],
      ['Privacy and stigma', 'No accounts, names or student numbers. Pickup codes only. Shelves sit in busy, neutral spots.'],
    ], { x: M, y: 1.8, w: CW, colW: [3.0, CW - 3.0], rowH: [0.45, 0.85, 0.7, 0.7, 0.7, 0.7] });
    s.addNotes('[5:50–6:15] Each risk has a control. Food safety: shelves hold sealed, shelf-stable food only; perishables go only through Drops, picked up within two hours; and Ontario’s Donation of Food Act protects good-faith donors. Emptied shelves: a posted guide and live counts. Volunteer drop-off: fifteen-minute check-ins with staff backup. Stale information: every listing is dated. Privacy: no accounts, no names.');
  }

  /* 14. SWOT */
  {
    const s = pres.addSlide({ masterName: 'EXECUTION' });
    title(s, 'SWOT: strongest on cost and accountability, weakest on supply');
    const q = [
      ['Strengths', ['Built and working today', 'Anonymous, walk-up access', 'Measures itself at every check-in', 'Pilot costs $3,500']],
      ['Weaknesses', ['Shelf-stable food only', 'Depends on volunteers to restock', 'No ID means no per-person limit', 'No real pilot data yet']],
      ['Opportunities', ['USC Grant Fund open until March', 'FoodRescue.ca surplus for Food Support', 'Event and catering leftovers', 'Residences and affiliate colleges next']],
      ['Threats', ['A food-safety incident', 'Theft or vandalism at a shelf', 'Volunteer burnout in exams', 'Confusion with USC hampers']],
    ];
    const cw = (CW - 0.3) / 2, ch = 2.2;
    q.forEach((b, i) => {
      const x = M + (i % 2) * (cw + 0.3), y = 1.8 + Math.floor(i / 2) * (ch + 0.25);
      box(s, x, y, cw, ch);
      T(s, b[0], { x: x + 0.3, y: y + 0.2, w: cw - 0.6, h: 0.45, fontSize: 20, bold: true, color: C.green });
      T(s, b[1].map((t, j) => ({ text: t, options: { bullet: { indent: 16 }, breakLine: j < b[1].length - 1 } })), { x: x + 0.3, y: y + 0.75, w: cw - 0.6, h: 1.35, fontSize: 16, color: C.ink, paraSpaceAfter: 2 });
    });
    s.addNotes('[6:15–6:35] Strengths: it’s built, anonymous, measures itself and costs $3,500. Weaknesses: shelf-stable food only, reliance on volunteers, and no per-person limit. Opportunities: the Grant Fund, FoodRescue.ca, and residences next. Threats: a safety incident, vandalism, burnout, and confusion with the hampers, so the app lists both.');
  }

  /* 15. Close */
  {
    const s = pres.addSlide({ masterName: 'PLAIN' });
    title(s, 'Our ask: fund the FoodLink pilot');
    const nums = [['$3,500', 'from the USC Grant Fund'], ['2', 'shelf locations, UCC plus one busy building'], ['11', 'weeks, January to March 2027']];
    const cw = (CW - 2 * 0.4) / 3;
    nums.forEach((n, i) => {
      const x = M + i * (cw + 0.4);
      box(s, x, 1.85, cw, 2.0);
      T(s, n[0], { x: x + 0.3, y: 2.05, w: cw - 0.6, h: 0.9, fontSize: 48, bold: true, color: C.green });
      T(s, n[1], { x: x + 0.3, y: 2.95, w: cw - 0.6, h: 0.7, fontSize: 16, color: C.ink });
    });
    T(s, 'FoodLink keeps the USC’s hampers and adds walk-up access with the accountability the USC asked for. The app is already built.', { x: M, y: 4.25, w: CW, h: 0.8, fontSize: 20, color: C.ink });
    hline(s, M, 5.4, CW);
    T(s, 'Thank you. We’re happy to take questions.', { x: M, y: 5.55, w: 7, h: 0.4, fontSize: 18, bold: true, color: C.ink });
    T(s, TEAM, { x: M, y: 6.0, w: CW, h: 0.4, fontSize: 14, color: C.muted });
    s.addNotes('[6:35–7:00] Our ask is $3,500 from the USC Grant Fund, two shelf locations and one Food Support contact for eleven weeks. FoodLink keeps the hampers the USC already runs and adds walk-up access with the accountability the USC asked for, and the app is already built. Thank you. We are happy to take questions.');
  }

  /* Appendix */
  {
    const s = pres.addSlide({ masterName: 'APPENDIX' });
    title(s, 'A1. Sources');
    const items = [
      ['Global News, Mar 15, 2024', '1,700+ hampers since September 2023; about 750 in all of 2022–23.'],
      ['The Gazette, Oct 4, 2024', 'Walk-ins closed Sept 2023 after a 600% rise in demand; hamper-only; 40 volunteers to six part-time staff; “incredibly difficult.”'],
      ['The Gazette, Feb 2025', 'Proposed 2025–26 USC budget drops the Food Support Coordinator role.'],
      ['USC Food Support page, Oct 31, 2026', 'Donations only; requests filled in as soon as 48 hours; locker pickup; “requests reopen Sept 8, 2025”; other food resources.'],
      ['Western 2026–27 fee schedule', 'None of the 21 USC fee lines funds food support.'],
      ['USC Grants page, Oct 31, 2026', 'About $100,000 a year; rolling applications October to March; food up to 30% of a grant; union-run operations ineligible.'],
      ['PROOF, Apr 29, 2026', '24.0% of people in Canada lived in food-insecure households in 2025 (Canadian Income Survey).'],
      ['Donation of Food Act, 1994 (Ontario)', 'Donors and distributors are not liable unless food was unfit and they acted with intent or reckless disregard.'],
      ['Second Harvest, FoodRescue.ca', 'Free surplus-food platform for charities and non-profits.'],
    ];
    items.forEach((r, i) => {
      const col = i < 5 ? 0 : 1, row = col === 0 ? i : i - 5;
      const x = M + col * (CW / 2 + 0.2), y = 1.75 + row * 0.95, w = CW / 2 - 0.2;
      T(s, r[0], { x, y, w, h: 0.3, fontSize: 14, bold: true, color: C.ink });
      T(s, r[1], { x, y: y + 0.32, w, h: 0.6, fontSize: 13, color: C.text });
    });
    s.addNotes('Appendix. Use only if a judge asks where a number came from.');
  }
  {
    const s = pres.addSlide({ masterName: 'APPENDIX' });
    title(s, 'A2. Budget assumptions');
    table(s, [
      ['Line', 'Amount', 'Basis'],
      ['Shelves and signage', '$1,100', 'Lockable steel shelving about $400 each; bins, signs and QR codes about $150 each. Quotes during preparation.'],
      ['Food seed stock', '$1,050', '30% of the grant, the USC Grants food cap. About 420 items at $2.50.'],
      ['Contingency', '$450', 'About 13% of the budget.'],
      ['Hygiene products', '$400', 'Period products, first on the USC most-needed list, plus soap and toothpaste.'],
      ['Promotion', '$250', 'Posters, QR stickers, social posts.'],
      ['Food-handler training', '$200', 'Online certification for six volunteers.'],
      ['Hosting and domain', '$50', 'Free hosting tiers; one year of a domain.'],
    ], { x: M, y: 1.75, w: CW, colW: [2.8, 1.3, CW - 4.1], rowH: 0.48 });
    T(s, 'To reach 1,000 items: about 420 bought, about 100 hygiene items, the rest from partners, food drives and Food Support.', { x: M, y: 6.2, w: CW, h: 0.35, fontSize: 14, color: C.ink });
    s.addNotes('Appendix. Bases for each budget line.');
  }
  {
    const s = pres.addSlide({ masterName: 'APPENDIX' });
    title(s, 'A3. Options we ruled out');
    table(s, [
      ['Option', 'What it offers', 'Why not on its own'],
      ['Reopen walk-ins at UCC 40F', 'Familiar, immediate', 'The USC closed them because they could not be run in an organized way. No live data.'],
      ['More hampers', 'Proven, private', 'Still a form and at least 48 hours. FoodLink lists hampers next to the shelves.'],
      ['Community fridge', 'Fresh food', 'Needs temperature logs, cleaning and public-health rules. A phase-two option.'],
      ['FoodRescue.ca alone', 'Free surplus for non-profits', 'Built for agencies collecting in bulk, not students. Food Support can join it to stock the shelves.'],
      ['Too Good To Go', 'Cheap surplus bags', 'Costs money and is mostly off campus.'],
    ], { x: M, y: 1.75, w: CW, colW: [3.0, 2.8, CW - 5.8], rowH: 0.62 });
    s.addNotes('Appendix. Why not something simpler.');
  }
  {
    const s = pres.addSlide({ masterName: 'APPENDIX' });
    title(s, 'A4. Questions we expect');
    const qa = [
      ['Isn’t this just walk-ins again?', 'Walk-up access, but every restock is counted and logged: the accountability the USC said walk-ins lacked.'],
      ['What stops one person emptying a shelf?', 'A posted guide, two restocks a day, and live counts that show rushes so stock can move.'],
      ['Who restocks?', 'Six certified volunteers on 15-minute check-ins, with Food Support staff covering gaps.'],
      ['Is handing out donated food safe and legal?', 'Sealed, labelled, in-date food only, enforced in the app. Ontario’s Donation of Food Act protects good-faith donors.'],
      ['Why an app and not a spreadsheet?', 'Students need live stock and the USC needs an audit trail. One app does both, and it already exists.'],
      ['What happens after week 11?', 'If four of five targets are met, add two shelves and hand daily running to Food Support. If not, stop and publish what we learned.'],
      ['Food Support is a USC service. Can a USC Grant fund this?', 'The grant goes to our student team, which runs the pilot. Food Support is a partner, not the applicant.'],
      ['How do you know students will use it?', 'We don’t yet; the pilot tests it. The bar is 1,000 items in 11 weeks, and a week-10 survey at the shelves asks users what to change.'],
    ];
    const cw = (CW - 0.4) / 2;
    qa.forEach((r, i) => {
      const x = M + (i % 2) * (cw + 0.4), y = 1.7 + Math.floor(i / 2) * 1.22;
      T(s, r[0], { x, y, w: cw, h: 0.36, fontSize: 16, bold: true, color: C.ink });
      T(s, r[1], { x, y: y + 0.4, w: cw, h: 0.72, fontSize: 14, color: C.text });
    });
    s.addNotes('Appendix. Short answers for Q&A.');
  }

  await pres.writeFile({ fileName: OUT });
  // Optional: write THEME's colours into the deck's theme part. Slides look the same without it, because
  // every shape uses explicit colours; it only changes the palette offered when editing.
  if (process.env.APPLY_THEME_JS) {
    const { applyTheme } = require(process.env.APPLY_THEME_JS);
    await applyTheme(OUT, THEME);
  }
  console.log('wrote', OUT);
})().catch((e) => { console.error(e); process.exit(1); });
