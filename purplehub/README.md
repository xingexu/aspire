# Purple Hub

A place to find club events at Western and reach the people running them. Students browse and search events with no
account. Club presidents post events and request funding. The USC approves both. Anyone with an account can message the USC or a
club, and gets their replies right there.

## Run it

You need Node.js 20 or newer and PostgreSQL installed (`brew install postgresql@14`).

```
cd purplehub
npm install
npm start
```

Open http://localhost:3001. In VS Code, press F5 and pick "Run Purple Hub".

The first start creates Purple Hub's own PostgreSQL database in `.pgdata/`, on port 5544 and reachable only from this
computer, and fills it with demo accounts. It leaves any other PostgreSQL alone. To use a database of your own, set
`DATABASE_URL`. `npm run db:stop` stops the built-in database.

| Section | Address | Who | What it shows |
|---|---|---|---|
| Home | `#week` | Everyone | Upcoming and past events, with search, sort by club and category |
| Messages | `#messages` | Signed in | Conversations with the USC and clubs, with unread counts and live delivery |
| For clubs | `#clubs` | Club presidents | Add a post, apply for funding, and see the USC's answers |
| Management | `#usc` | USC staff | Funding applications and posts to approve or decline, and totals |

## How it fits together

- `src/purplehub.html` is the page, `src/data.json` the real event list and `build.js` puts them together.
- `server/app.js` serves the page and a JSON API. `server/db.js` and `server/migrations/` hold the database, and `server/chat.js`
  the assistant.
- `PurpleHub.html` is a single-file copy to send around. With no server behind it, it only shows the events.

Real events come from the public Instagram pages of PBSN, WFN, W5, CSA, CAISA and TAW, read on Oct 31, 2026. Those clubs
haven't joined. Add new ones to `src/data.json`, with a screenshot in `assets/events/`. The screenshots belong to the clubs,
and the seal in `assets/usc-logo.png` belongs to the USC.

## Deploying to Vercel

Set the project's Root Directory to `purplehub`. `vercel.json` does the rest. Add these environment variables:

- `DATABASE_URL`: a hosted PostgreSQL. Tables are created on the first request. Without it, events and the assistant still work, and sign-in says it isn't connected.
- `OPENAI_API_KEY`: optional, for GPT answers.
- `DEMO_PASSWORD`: adds the shared accounts below with this password.

Vercel functions can't hold a connection open, so there the page checks for new messages every 8 seconds.

## Accounts

Everyone signs up with their own `@uwo.ca` email and a new password, stored as a salted hash, and every role works straight away. Browsing needs no account.

The sign-in screen also lists shared accounts for USC staff, each club president and four students, and shows their password, so anyone can try any role in one press. **This means anyone can act as the USC, read its messages and decide funding.** It suits a demo, not real data. Set `SEED_DEMO=0` on a fresh database, and remove the list, before real use.

Emails aren't verified yet, because that needs a mail service.

## The assistant

"Ask Purple Hub" sits in the bottom-right corner. Copy `.env.example` to `.env` and add `OPENAI_API_KEY` to answer with a GPT
model (`OPENAI_MODEL`, by default `gpt-4o-mini`), grounded in the real event list. Each question costs a little on your OpenAI
account. The key stays on the server, and only the conversation text is sent, never who is asking. Without a key, or if the call
fails, it answers from the same event list and how-to notes using built-in rules.

"Add a post" for club presidents is a step-by-step form written as a chat. Importing a club's
posts from Instagram automatically would need its Instagram business login.

## How to use it

A first-time visitor gets a 7-step walkthrough that spotlights the real buttons, written for someone who rarely uses
apps. Reset tutorial in the footer starts it over.

## Look and scaling

Boxes are plain translucent panels over a faded photo of Western (`assets/western.jpg`). The look is neutral, and purple
appears only as an accent: hover, focus and the walkthrough spotlight. Pages cross-fade when you move between them. The
tab bar and tour card use [liquid-glass-react](https://github.com/rdev/liquid-glass-react), mounted by `src/glass.jsx`.
Refraction only shows in Chrome and Edge. Safari and every iPhone browser run WebKit, which drops the blur if the
displacement filter is on, so they get the library's frost and rim without the bending. If the library fails, or the
viewer asks for less transparency, the same pieces fall back to CSS.

The bundle is committed, so `npm start` needs no packages. After editing `src/glass.jsx`, run `npm install` and
`npm run build:glass`.

Sizes are in rem. Tabs float at the top from 1200px wide and become a bottom bar below that, inside the iPhone safe
areas. Type grows on displays wider than about 1440px, and the page respects browser zoom and text-size settings.

## Test it

```
npm install                          # Playwright, for the browser test
npx playwright install chromium webkit
npm run test:ui                      # every flow against a real throwaway PostgreSQL, from 320px to 2560px in both engines
```

Playwright's WebKit doesn't render `backdrop-filter`, not even on a bare test page, so these tests can't confirm the
frosted look in Safari. Check that by eye in real Safari or on an iPhone.
