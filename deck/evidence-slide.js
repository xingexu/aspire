// Slide 10: evidence that walk-up, anonymous campus food gets used, from comparable programs.
// Every number is quoted from the source named under it (checked Oct 31, 2026).
'use strict';
module.exports = function evidence(pres, k) {
  const { T, S, title, rect, hline, C, M, CW } = k;
  const s = pres.addSlide({ masterName: 'MODEL' });
  title(s, 'Where campus food is walk-up and\nanonymous, students use it');
  const tiles = [
    ['5,263', 'door openings in 2022–23 at anonymous, unstaffed mini-pantries at Virginia Commonwealth University, more than double the year before. Busiest: the gym and the main library. Vandalism was rare.',
      'Jones et al., Journal of Agriculture, Food Systems, and Community Development, 2024 (corrected 2025)'],
    ['A few hours', 'for a week’s stock to run out at the University of Alberta’s walk-up pantry, while its campus food bank had a waitlist of about six weeks.',
      'The Gateway, May 3, 2024'],
    ['48.5%', 'of TMU students were food insecure in the past year, but only 20% had used the campus food bank. 92.6% want more free food programs on campus.',
      'The Eyeopener, Oct 27, 2026 (survey of nearly 900 students)'],
  ];
  const gap = 0.4, tw = (CW - 2 * gap) / 3, ty = 2.0, th = 3.05;
  tiles.forEach((t, i) => {
    const x = M + i * (tw + gap);
    hline(s, x, ty, tw, C.ink, 1);
    S(s, t[0], { x, y: ty + 0.18, w: tw, h: 0.8, fontSize: 40, color: C.green });
    T(s, t[1], { x, y: ty + 1.05, w: tw - 0.1, h: 1.45, fontSize: 14.5, color: C.text });
    T(s, t[2], { x, y: ty + 2.55, w: tw - 0.1, h: 0.45, fontSize: 10.5, color: C.muted });
  });
  rect(s, M, 5.35, CW, 0.95, C.greenSoft);
  T(s, [
    { text: 'What we take from it: ', options: { bold: true, color: C.ink } },
    { text: 'put shelves where students already go (the UCC and the main library), line up supply before launch, and measure Western’s own use from day one. We have no Western usage data yet; the pilot produces it.' },
  ], { x: M + 0.3, y: 5.35, w: CW - 0.6, h: 0.95, fontSize: 15, color: C.ink, valign: 'middle' });
  s.addNotes('[4:05–4:30] We have no usage data of our own yet, so here is the closest evidence. Anonymous, unstaffed pantries at Virginia Commonwealth University saw 5,263 door openings in one school year, with little misuse. Alberta’s walk-up pantry ran out of a week’s stock in hours. At TMU, half of students are food insecure, but only one in five used the food bank.');
};
