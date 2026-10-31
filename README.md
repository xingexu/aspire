# PBSN ASPIRE: FoodLink

FoodLink gives Western students walk-up access to free food without a form or a name: two campus shelves
with live stock counts, sealed surplus from campus partners that students reserve with an anonymous code,
and a dashboard that shows the USC whether the pilot is working. Every restock is counted, which is the
accountability the USC said walk-ins lacked.

| Folder | What is in it |
|---|---|
| [`app/`](app/) | The working app: browser UI, shared business rules, and a Node.js server that stores an append-only event log in PostgreSQL (or a JSON file). Full documentation in [`app/README.md`](app/README.md). |
| [`deck/`](deck/) | The 7-minute pitch deck, `PBSN_ASPIRE_FoodLink.pptx`, and the script that builds it. |

## Run the app

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

## Rebuild the deck

```
cd deck
npm install
npm run build         # writes PBSN_ASPIRE_FoodLink.pptx
npm run screenshots   # optional: retakes img/*.png from the app (Playwright + Chromium, Python with Pillow)
```

The deck uses Source Sans 3 from Google Fonts. Google Slides has it built in; install it locally before
opening the file in PowerPoint or Keynote, or line breaks will move.
