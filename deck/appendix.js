// Appendix for the official-case edition: SWOT, access history, sources, budget basis, options ruled out, Q&A.
'use strict';
module.exports = function appendix(pres, k) {
  const { T, B, title, table, hline, vline, card, bullets, C, M, CW, W, span, colX, PAD, TOP, NB } = k;

  /* A1. SWOT */
  {
    const s = pres.addSlide({ masterName: 'APPENDIX' });
    title(s, 'A1. SWOT analysis');
    const q = [
      ['Strengths', ['Built and working today', 'Anonymous, walk-up access', 'Runs on USC assets already paid for', 'Measures itself at every check-in'], C.white],
      ['Weaknesses', ['Shelf-stable food only on shelves', 'Depends on volunteers', 'No per-person limit', 'No Western usage data yet'], C.panel],
      ['Opportunities', ['USC Now overhaul already planned', 'O-Week 2027 reaches every first-year', 'Surplus from USC hospitality', 'Same model for CoatCycle or Peer Support'], C.white],
      ['Threats', ['A food-safety incident', 'Turnover every year', 'Stigma if shelves are badly placed', 'A host building says no'], C.panel],
    ];
    const bw = span(6), bh = 2.25, rg = 0.22;
    q.forEach((b, i) => {
      const x = colX((i % 2) * 6), y = 1.6 + Math.floor(i / 2) * (bh + rg);
      card(s, x, y, bw, bh, b[2]);
      B(s, b[0], { x: x + PAD, y: y + 0.22, w: bw - 2 * PAD, h: 0.45, fontSize: 24, color: C.green });
      T(s, bullets(b[1]), { x: x + PAD, y: y + 0.8, w: bw - 2 * PAD, h: 1.35, fontSize: 17, color: C.ink, paraSpaceAfter: 2 });
    });
    s.addNotes('Appendix. SWOT, if a judge asks for it.');
  }

  /* A2. Access history */
  {
    const s = pres.addSlide({ masterName: 'APPENDIX' });
    title(s, 'A2. How access to Food Support\nchanged, 2023 to 2026');
    const rws = [
      ['Sept 2023', 'Walk-ins closed after demand rose 600%.'],
      ['Oct 2024', 'Hamper-only. 40 volunteers were replaced by six part-time staff.'],
      ['Feb 2025', 'The proposed USC budget dropped the Food Support Coordinator.'],
      ['Oct 2026', 'The USC page lists walk-in hours in UCC 40F, Mon–Thu, 10 to 4, and still says requests reopen Sept 8, 2025.'],
      ['Today', 'Otherwise: an online form, at least 48' + NB + 'hours, and a locker.'],
    ];
    const lx = M + 0.12;
    vline(s, lx, TOP + 0.12, 3.7, C.hair, 1.5);
    rws.forEach((r, i) => {
      const y = TOP + i * 0.84;
      const last = i === rws.length - 1;
      s.addShape('ellipse', { x: lx - 0.095, y: y + 0.1, w: 0.19, h: 0.19, fill: { color: last ? C.green : C.paper }, line: { color: last ? C.green : C.muted, width: 1.5 } });
      B(s, r[0], { x: M + 0.5, y, w: span(2) + 0.2, h: 0.42, fontSize: 20, color: last ? C.green : C.ink });
      T(s, r[1], { x: colX(3), y: y + 0.02, w: span(9), h: 0.72, fontSize: 18, color: last ? C.ink : C.text });
    });
    T(s, 'Sources: The Gazette, Oct 4, 2024 and Feb 2025; USC Food Support page, checked Oct 31, 2026.', { x: M, y: 6.48, w: CW, h: 0.32, fontSize: 11, color: C.muted, valign: 'bottom' });
    s.addNotes('Appendix. How access narrowed, if asked.');
  }

  /* A3. Sources */
  {
    const s = pres.addSlide({ masterName: 'APPENDIX' });
    title(s, 'A3. Sources');
    const items = module.exports.sources;
    const per = Math.ceil(items.length / 2);
    items.forEach((r, i) => {
      const col = i < per ? 0 : 1, row = col === 0 ? i : i - per;
      const x = colX(col * 6), w = span(6), y = 1.6 + row * 0.68;
      B(s, r[0], { x, y, w, h: 0.28, fontSize: 13 });
      T(s, r[1], { x, y: y + 0.29, w, h: 0.3, fontSize: 11 });
    });
    s.addNotes('Appendix. Use only if a judge asks where a number came from.');
  }

  /* A4. Budget assumptions */
  {
    const s = pres.addSlide({ masterName: 'APPENDIX' });
    title(s, 'A4. Budget assumptions');
    table(s, [
      ['Line', 'Amount', 'Basis'],
      ['Coordinator (part-time)', '$3,000', 'About a third of the $9,000 coordinator role the USC funds for Public Arts.'],
      ['Shelving and signs', '$1,100', 'Two lockable shelving units (about $400 each), bins, signs and QR codes.'],
      ['Food stock', '$1,050', 'About 420 shelf-stable items at $2.50, bought after approval.'],
      ['Contingency', '$600', 'About 10% of the other lines.'],
      ['Promotion', '$500', 'Table tents, posters, QR stickers and messenger kits.'],
      ['Hygiene items', '$400', 'Soap and toothpaste; period products come from Free the Dot.'],
      ['Volunteer training', '$200', 'Online food-handler certification for six volunteers.'],
      ['Hosting', '$50', 'Free hosting tier and a domain; the app sits inside USC Now.'],
      ['Full year, six shelves', '~$25,000', 'Full coordinator; four more shelves; stock and hygiene at pilot rates for 26 weeks; plus 10%. Under 70 cents a student.'],
    ], { x: M, y: 1.55, w: CW, colW: [3.0, 1.25, CW - 4.25], rowH: 0.43 }, { head: 14, body: 14 });
    T(s, 'Council ($500 each) and sponsor ($1,000) amounts are targets to confirm. Surplus food from USC hospitality is in kind.', { x: M, y: 6.38, w: CW, h: 0.32, fontSize: 13, color: C.ink });
    s.addNotes('Appendix. Bases for each budget line.');
  }

  /* A5. Options ruled out */
  {
    const s = pres.addSlide({ masterName: 'APPENDIX' });
    title(s, 'A5. Options we ruled out');
    table(s, [
      ['Option', 'What it offers', 'Why not on its own'],
      ['Bigger O-Week push for hampers', 'Reaches every first-year', 'Lands when information overload peaks; nothing at the moment of need.'],
      ['Longer hours at UCC 40F', 'Familiar, staffed', 'Still one basement room, and every extra hour needs paid staff.'],
      ['A standalone FoodLink app', 'Full control', 'One more app to download. FoodLink lives inside USC Now instead.'],
      ['Community fridge', 'Fresh food', 'Needs temperature logs and public-health rules. A phase-two option.'],
      ['Too Good To Go', 'Cheap surplus bags', 'Costs students money and is mostly off campus.'],
    ], { x: M, y: 1.55, w: CW, colW: [3.5, 2.55, CW - 6.05], rowH: 0.72 }, { head: 14, body: 16 });
    s.addNotes('Appendix. Why not something simpler.');
  }

  /* A6. Questions we expect */
  {
    const s = pres.addSlide({ masterName: 'APPENDIX' });
    title(s, 'A6. Questions we expect');
    const qa = module.exports.questions;
    qa.forEach((r, i) => {
      const x = colX((i % 2) * 6), w = span(6), y = 1.55 + Math.floor(i / 2) * 1.27;
      hline(s, x, y - 0.1, w);
      B(s, r[0], { x, y, w, h: 0.36, fontSize: 16 });
      T(s, r[1], { x, y: y + 0.4, w, h: 0.78, fontSize: 14 });
    });
    s.addNotes('Appendix. Short answers for Q&A.');
  }
};

module.exports.sources = [
  ['Aspire 2026 case and exhibits', 'USC fees, 2026–27 budget, FY2024 statements, Roadmap, election data.'],
  ['Global News, Mar 15, 2024', '1,700+ hampers since Sept 2023; about 750 in all of 2022–23.'],
  ['The Gazette, Oct 4, 2024', 'Walk-ins closed Sept 2023 after a 600% rise; “incredibly difficult.”'],
  ['The Gazette, Feb 2025', 'Proposed 2025–26 budget drops the Food Support Coordinator role.'],
  ['USC Food Support page, Oct 31, 2026', 'Mon–Thu 10–4, UCC 40F; hampers “as soon as 48 hours”; donations only.'],
  ['CASA, Walking the Tightrope, Mar 2025', 'Abacus Data, 1,500 students, May 2024: 40% skipped meals for cost.'],
  ['The Eyeopener, Oct 27, 2026', 'TMU: 48.5% food insecure; 20% had visited the food bank.'],
  ['Jones et al., JAFSCD 2024; corrected 2025', 'Anonymous pantries at VCU: 5,263 door openings in 2022–23.'],
  ['The Gateway, May 3, 2024', 'U of Alberta: walk-up pantry empty in hours; six-week waitlist.'],
  ['LSPIRG, Year in Review 2023–2024', 'Laurier’s free weekly food distribution: up to 200 students a week.'],
  ['Western News, Oct 25, 2024', 'Campus dining gave 7,500+ surplus meals to 19 off-campus agencies.'],
  ['Donation of Food Act, 1994 (Ontario)', 'Donors are liable only for unfit food given with intent or recklessness.'],
  ['Western Libraries, Weldon Displays Policy', 'Displays in Weldon are selected and authorized by Western Libraries.'],
];

module.exports.questions = [
  ['Why Food Support and not Peer Support?', 'The USC’s roadmap names it, its need is measurable, and the fix is visible. FoodLink also points students to Peer Support.'],
  ['Isn’t this just walk-ins again?', 'Walk-up access with counted restocks and live stock: the controls the USC said walk-ins lacked.'],
  ['Won’t shelves pull students from hampers?', 'Shelves cover today and hampers cover the week; the app links to both. Hamper requests are tracked and must not fall.'],
  ['Who runs it when this year’s team leaves?', 'Host councils own their shelves, the coordinator role carries over, and the app keeps the counts and the playbook.'],
  ['Why not a separate app?', 'Students won’t download another app. FoodLink is a tab in USC Now, which the roadmap already plans to overhaul.'],
  ['What stops one person emptying a shelf?', 'A posted guide, two restocks a day, and live counts that show rushes so stock can move.'],
  ['Is giving out surplus food safe and legal?', 'Sealed, labelled, in-date food only, checked in the app. Ontario’s Donation of Food Act protects good-faith donors.'],
  ['What happens after week 11?', 'If five of six goals are met, add shelves and launch at O-Week 2027. If not, stop and publish what we learned.'],
];
