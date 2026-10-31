# PBSN ASPIRE: Counts

Our answer to the PBSN Aspire 2026 case, *Driving Engagement for Western's University Students' Council*. We chose
PD USC (Professional Development USC) and built **Counts**: club events that count toward a student's confirmed
record, with a ladder that ends in USC advocacy and Council. See [`counts/README.md`](counts/README.md).

Open this folder in VS Code and press **F5** ("Run Counts"), or run `cd counts && npm start` and open
http://localhost:3001. No packages to install.

## Earlier idea: FoodLink

The `app/` and `deck/` folders hold our earlier direction, FoodLink (USC Food Support Services), which we have
replaced with Counts. They still run as described below.

FoodLink gives Western students walk-up access to free food without a form or a name: two campus shelves
with live stock counts, sealed surplus from campus partners that students reserve with an anonymous code,
and a dashboard that shows the USC whether the pilot is working. Every restock is counted, which is the
accountability the USC said walk-ins lacked.

| Folder | What is in it |
|---|---|
| [`app/`](app/) | The working app: browser UI, shared business rules, and a Node.js server that stores an append-only event log in PostgreSQL (or a JSON file). Full documentation in [`app/README.md`](app/README.md). |
| [`deck/`](deck/) | The 7-minute pitch deck, `PBSN_ASPIRE_FoodLink.pptx`, and the script that builds it. |

### Open in VS Code

Open this folder in VS Code, then press **F5** and pick "Run FoodLink (earlier idea)". It installs the packages,
builds the page, starts the server and opens http://localhost:3000. The tasks "FoodLink: test" and
"FoodLink: npm install" are under Terminal > Run Task.

### Run the app

You need Node.js 20 or newer.

```
cd app
npm install
npm start
```

Open http://localhost:3000. The presenter view used in the pitch is http://localhost:3000/#present:
press **Reset demo**, then click the five steps along the bottom.

With no database configured, the data lives in `app/server/data/events.json`. To use PostgreSQL instead,
create an empty database and start with `DATABASE_URL`, for example
`DATABASE_URL=postgres://localhost/foodlink npm start`. The tables are created on first start.

Tests:

```
npm test          # business rules and server (uses a local PostgreSQL if one is installed)
npm run test:ui   # browser test of the standalone demo (needs Playwright with Chromium)
```

The dashboard starts from a simulated six-week pilot, and the app labels it as simulated. It is demo data,
not results.

### Rebuild the deck

```
cd deck
npm install
npm run build         # writes PBSN_ASPIRE_FoodLink.pptx
npm run screenshots   # optional: retakes img/*.png from the app (Playwright + Chromium, Python with Pillow)
```

The deck uses Schibsted Grotesk (and Source Serif 4 for one quote) from Google Fonts. Install both before
opening the file in PowerPoint or Keynote, or line breaks will move.
