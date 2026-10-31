// Slide 10 (v4 type system): evidence that walk-up, anonymous campus food gets used.
// Every number is quoted from the source named under it (checked Oct 31, 2026).
'use strict';
module.exports = function evidence(pres, k) {
  const { T, B, title, rect, hline, C, M, CW, span, colX, PAD, TOP } = k;
  const s = pres.addSlide({ masterName: 'MODEL' });
  title(s, 'Where campus food is walk-up and\nanonymous, students use it');
  const tiles = [
    ['5,263', 'door openings in one school year at anonymous, unstaffed pantries at Virginia Commonwealth University. Vandalism was rare.',
      'Jones et al., JAFSCD, 2024 (corrected 2025)'],
    ['Hours', 'for a week’s stock to run out at the University of Alberta’s walk-up pantry. Its food bank had a six-week waitlist.',
      'The Gateway, May 3, 2024'],
    ['48.5%', 'of TMU students were food insecure in the past year, but only 20% had used the campus food bank.',
      'The Eyeopener, Oct 27, 2026 (nearly 900 students)'],
  ];
  tiles.forEach((t, i) => {
    const x = colX(i * 4), w = span(4);
    hline(s, x, TOP, w, C.ink, 1.25);
    B(s, t[0], { x, y: TOP + 0.15, w, h: 0.95, fontSize: 56, color: C.green });
    T(s, t[1], { x, y: TOP + 1.18, w: w - 0.1, h: 1.35, fontSize: 17 });
    T(s, t[2], { x, y: TOP + 2.6, w: w - 0.1, h: 0.32, fontSize: 11.5, color: C.muted });
  });
  rect(s, M, TOP + 3.2, CW, 1.0, C.greenSoft);
  T(s, [
    { text: 'What we take from it: ', options: { bold: true, color: C.ink } },
    { text: 'put shelves where students already go, line up supply before launch, and measure Western’s own use from day one. We have no Western usage data yet; the pilot produces it.' },
  ], { x: M + PAD, y: TOP + 3.2, w: CW - 2 * PAD, h: 1.0, fontSize: 17, color: C.ink, valign: 'middle' });
  s.addNotes('[4:05–4:30] We have no usage data of our own yet, so here is the closest evidence. Anonymous, unstaffed pantries at Virginia Commonwealth University saw 5,263 door openings in one school year, with little misuse. Alberta’s walk-up pantry ran out of a week’s stock in hours. At TMU, half of students are food insecure, but only one in five used the food bank.');
};
