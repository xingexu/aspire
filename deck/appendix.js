// Appendix slides (v4 type system): sources, budget basis, options ruled out, Q&A.
'use strict';
module.exports = function appendix(pres, k) {
  const { T, B, title, table, hline, C, M, CW, span, colX } = k;

  {
    const s = pres.addSlide({ masterName: 'APPENDIX' });
    title(s, 'A1. Sources');
    const items = module.exports.sources;
    const per = Math.ceil(items.length / 2);
    items.forEach((r, i) => {
      const col = i < per ? 0 : 1, row = col === 0 ? i : i - per;
      const x = colX(col * 6), w = span(6), y = 1.6 + row * 0.72;
      B(s, r[0], { x, y, w, h: 0.28, fontSize: 13 });
      T(s, r[1], { x, y: y + 0.28, w, h: 0.42, fontSize: 11.5 });
    });
    s.addNotes('Appendix. Use only if a judge asks where a number came from.');
  }
  {
    const s = pres.addSlide({ masterName: 'APPENDIX' });
    title(s, 'A2. Budget assumptions');
    table(s, [
      ['Line', 'Amount', 'Basis'],
      ['Food seed stock', '$1,050', 'About 420 shelf-stable items at $2.50, bought only after approval.'],
      ['Hygiene products', '$400', 'Period products, first on the USC most-needed list, plus soap and toothpaste.'],
      ['Signs, labels, bins', '$300', 'Shelf signs, QR labels and stock bins for two sites.'],
      ['Contingency', '$250', '10% of the request.'],
      ['Promotion', '$250', 'Posters, QR stickers and social posts.'],
      ['Volunteer training', '$200', 'Online food-handler certification for six volunteers.'],
      ['Hosting', '$50', 'Free hosting tiers and one year of a domain.'],
      ['Shelving (not requested)', 'In kind', 'Borrowed from Food Support or the host building.'],
      ['Team match (not requested)', '$250', '10% from our team, which the committee prefers.'],
    ], { x: M, y: 1.6, w: CW, colW: [3.05, 1.15, CW - 4.2], rowH: 0.42 }, { head: 14, body: 14 });
    T(s, 'To reach 1,000 items: about 420 bought, about 100 hygiene items, and the rest from partners, food drives and Food Support.', { x: M, y: 6.3, w: CW, h: 0.35, fontSize: 14, color: C.ink });
    s.addNotes('Appendix. Bases for each budget line.');
  }
  {
    const s = pres.addSlide({ masterName: 'APPENDIX' });
    title(s, 'A3. Options we ruled out');
    table(s, [
      ['Option', 'What it offers', 'Why not on its own'],
      ['Longer walk-in hours at UCC 40F', 'Familiar, staffed', 'Still one basement room; every extra hour needs paid staff. No live stock or counts.'],
      ['More hampers', 'Proven, private', 'Still a form and at least 48 hours. FoodLink lists hampers next to the shelves.'],
      ['Community fridge', 'Fresh food', 'Needs temperature logs, cleaning and public-health rules. A phase-two option.'],
      ['FoodRescue.ca alone', 'Free surplus', 'Built for agencies collecting in bulk, not students. Food Support can join it.'],
      ['Too Good To Go', 'Cheap surplus bags', 'Costs money and is mostly off campus.'],
    ], { x: M, y: 1.6, w: CW, colW: [3.5, 2.4, CW - 5.9], rowH: 0.72 }, { head: 14, body: 16 });
    s.addNotes('Appendix. Why not something simpler.');
  }
  {
    const s = pres.addSlide({ masterName: 'APPENDIX' });
    title(s, 'A4. Questions we expect');
    const qa = module.exports.questions;
    qa.forEach((r, i) => {
      const x = colX((i % 2) * 6), w = span(6), y = 1.58 + Math.floor(i / 2) * 1.27;
      hline(s, x, y - 0.1, w);
      B(s, r[0], { x, y, w, h: 0.36, fontSize: 16 });
      T(s, r[1], { x, y: y + 0.4, w, h: 0.78, fontSize: 14 });
    });
    s.addNotes('Appendix. Short answers for Q&A.');
  }
};

module.exports.sources = [
  ['Global News, Mar 15, 2024', '1,700+ hampers since September 2023; about 750 in all of 2022–23.'],
  ['The Gazette, Oct 4, 2024', 'Walk-ins closed Sept 2023 after a 600% rise in demand; hamper-only; 40 volunteers to six part-time staff; “incredibly difficult.”'],
  ['The Gazette, Feb 2025', 'Proposed 2025–26 USC budget drops the Food Support Coordinator role.'],
  ['USC Food Support page, checked Oct 31, 2026', 'Walk-in food bank in UCC 40F, Mon–Thu 10–4; hampers “as soon as 48 hours”; donations only; “Requests reopen Sept 8, 2025.”'],
  ['Western 2026–27 fee schedule', 'None of the 21 USC fee lines funds food support.'],
  ['USC Grants page, checked Oct 31, 2026', 'About $100,000 a year, rolling to March. No equipment purchases or ongoing costs. 10% match preferred. Collaboratives may include ineligible partners.'],
  ['CASA, Walking the Tightrope, Mar 2025', 'Abacus Data survey of 1,500 students, May 2024: 40% skipped meals because of cost.'],
  ['Jones et al., JAFSCD 13(3), 2024; corrected Apr 16, 2025', 'Anonymous mini-pantries at VCU: 5,263 door openings in 2022–23; busiest at the gym and main library; vandalism rare.'],
  ['The Gateway, May 3, 2024', 'University of Alberta: walk-up pantry empty after a few hours; campus food bank waitlist about six weeks.'],
  ['The Eyeopener, Oct 27, 2026', 'TMU: 48.5% food insecure; 20% had visited the food bank; 92.6% support more free on-campus food programs.'],
  ['Western News, Oct 25, 2024', 'Over 7,500 surplus meals from campus dining to 19 off-campus agencies since May 2024.'],
  ['Donation of Food Act, 1994 (Ontario)', 'Donors and distributors are not liable unless food was unfit and they acted with intent or reckless disregard.'],
  ['Second Harvest, FoodRescue.ca', 'Free surplus-food platform for charities and non-profits.'],
  ['Western Libraries, Weldon Displays Policy', 'Displays in Weldon are selected and authorized by Western Libraries.'],
];

module.exports.questions = [
  ['Isn’t this just walk-ins again?', 'Walk-up access, but every restock is counted and logged: the accountability the USC said walk-ins lacked.'],
  ['The USC already lists walk-in hours. Why shelves?', 'UCC 40F is one basement room open 24\u00a0hours a week. Shelves in busy buildings reach students evenings and weekends.'],
  ['What stops one person emptying a shelf?', 'A posted guide, two restocks a day, and live counts that show rushes so stock can move.'],
  ['Who restocks?', 'Six certified volunteers on 15-minute check-ins, with Food Support staff covering gaps.'],
  ['Is handing out donated food safe and legal?', 'Sealed, labelled, in-date food only, enforced in the app. Ontario’s Donation of Food Act protects good-faith donors.'],
  ['Can a USC Grant include Food Support?', 'Yes. Our team applies as enrolled undergraduates, and USC Grants allow a collaborative to include ineligible partners.'],
  ['How do you know students will use it?', 'Comparable walk-up pantries are used heavily (VCU, Alberta). We have no Western data yet; the pilot measures it.'],
  ['What happens after week 11?', 'If four of five targets are met, add two shelves and hand daily running to Food Support. If not, stop and publish what we learned.'],
];
