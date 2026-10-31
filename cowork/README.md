# CoWork

A PD USC program, prototyped for the PBSN Aspire 2026 case. Clubs keep their brand and run the events students
already like. A club ticks one box on the event proposal it already files in WesternLink and promises three things
(open to everyone, free, someone at the door). The USC then promotes the event and pays the club $3 for every
student new to it, from employer partners. Students check in with a door code and climb four rungs on a confirmed
record: Show up, Pitch in, Lead, Represent. The top rung is Policy Fellows (with the USC advocacy team) and Run for
It (campaign skills before the elections).

## Run it

You need Node.js 18 or newer. There are no packages to install.

```
cd cowork
npm start
```

Open http://localhost:3001. In VS Code, press F5 and pick "Run CoWork".

| Section | Address | What it shows |
|---|---|---|
| This week | `#week` | Club event posters that count, with check-in and pitch-in |
| My record | `#record` | The four rungs, a confirmed activity list and résumé lines |
| For clubs | `#clubs` | One-box opt-in, the three promises, the door sign, payouts and pitch-in confirmations |
| USC dashboard | `#usc` | First-timers, the ladder, the pipeline to Council and the screen at The Spoke |
| Why it works | `#why` | The case answer: problem, insight, what is new, cost, targets, timeline and sources |
| Live demo | `#demo` | Five steps for the pitch. Press Reset demo before presenting |

The page is one file, `src/cowork.html`. `npm run build` writes `dist/index.html` for local use and `CoWork.html`, a
complete single file to send as an attachment: logo, styles and scripts are all inside it and it makes no network
requests. Clubs, students and the dashboard numbers are fictional or simulated and are labelled that way in the app.
Demo state lives in the browser (localStorage, if allowed) and syncs between open tabs.

## How to use it

A first-time visitor gets a 10-step walkthrough, written for someone who rarely uses apps. It spotlights the real
buttons and ends with a practice check-in. It opens once, except on `#demo`, where it would interrupt a live pitch.
Help (top right) brings it back. To see it again as a new visitor, clear the site's data or use a private window.

## Sign-in

Students need no account. The club tools (`#clubs`) and USC dashboard (`#usc`) are locked until someone signs in:

| Role | Username | Password | Sees |
|---|---|---|---|
| USC admin | `uscadmin` | `usc2026` | The dashboard, and every club |
| Club president | `jordan`, `priya`, `lina`, `owen`, `sam` or `ade` | `club2026` | Only their own club |

These are demo accounts. The page has no server, so sign-in only decides what the browser shows and the passwords are in
the page source. It is not real security, and real accounts would need a server.

## Look and scaling

Boxes are plain translucent panels over a faded photo of Western (`assets/western.jpg`). The look is neutral, and purple
appears only as an accent: hover, focus and the walkthrough spotlight. The USC logo keeps its own colours. Pages cross-fade
when you move between them. The tab bar and tour card use
[liquid-glass-react](https://github.com/rdev/liquid-glass-react), mounted by `src/glass.jsx`. Refraction only shows in
Chrome and Edge. Safari and every iPhone browser run WebKit, which drops the blur if the displacement filter is on, so they
get the library's frost and rim without the bending. If the library fails, or the viewer asks for less transparency, the
same pieces fall back to CSS.

The bundle is committed, so `npm start` needs no packages. After editing `src/glass.jsx`, run `npm install` and
`npm run build:glass`.

Sizes are in rem. Tabs float at the top from 1200px wide and become a bottom bar below that, inside the iPhone safe
areas. Type grows on displays wider than about 1440px, and the page respects browser zoom and text-size settings.

The USC seal in `assets/usc-logo.png` is cropped from the logo on westernusc.ca and belongs to the USC. It's used here
for the case competition only.

## Test it

```
npm install                          # Playwright, for the browser test
npx playwright install chromium webkit
npm run test:ui                      # every flow, the walkthrough, and every page from 320px to 2560px in both engines
```

Playwright's WebKit doesn't render `backdrop-filter`, not even on a bare test page, so these tests can't confirm the
frosted look in Safari. Check that by eye in real Safari or on an iPhone.
