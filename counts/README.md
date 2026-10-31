# Counts

A PD USC program, prototyped for the PBSN Aspire 2026 case. Clubs keep their brand and run the events students
already like. A club ticks one box on the event proposal it already files in WesternLink and promises three things
(open to everyone, free, someone at the door). The USC then promotes the event and pays the club $3 for every
student new to it, from employer partners. Students check in with a door code and climb four rungs on a confirmed
record: Show up, Pitch in, Lead, Represent. The top rung is Policy Fellows (with the USC advocacy team) and Run for
It (campaign skills before the elections).

## Run it

You need Node.js 18 or newer. There are no packages to install.

```
cd counts
npm start
```

Open http://localhost:3001. In VS Code, press F5 and pick "Run Counts".

| Section | Address | What it shows |
|---|---|---|
| This week | `#week` | Club event posters that count, with check-in and pitch-in |
| My record | `#record` | The four rungs, a confirmed activity list and résumé lines |
| For clubs | `#clubs` | One-box opt-in, the three promises, the door sign, payouts and pitch-in confirmations |
| USC dashboard | `#usc` | First-timers, the ladder, the pipeline to Council and the screen at The Spoke |
| Why it works | `#why` | The case answer: problem, insight, what is new, cost, targets, timeline and sources |
| Live demo | `#demo` | Five steps for the pitch. Press Reset demo before presenting |

The page is one file, `src/counts.html`. `npm run build` writes `dist/index.html` for local use. Clubs, students and
the dashboard numbers are fictional or simulated and are labelled that way in the app. Demo state lives in the
browser (localStorage, if allowed) and syncs between open tabs.

## Test it

```
npm install          # Playwright, for the browser test
npm run test:ui      # 83 checks: every section at desktop and phone width, light and dark, and every flow
```

The test serves Google Fonts from `test/fonts` so it runs offline once the fonts are fetched.
