# FHL Dashboard

A dashboard for a fantasy hockey league (FHL), built with [Observable Framework](https://observablehq.com/framework/)
and published on GitHub Pages. It started as a read-only view of player stats and now also handles roster moves and
trades between GMs, backed by a Cloudflare Worker, a D1 database, EmailJS and GitHub Actions.

**How the pieces fit together:** see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
**Worker setup and API:** see [worker/README.md](worker/README.md).

## Quick start

```bash
npm install
npm run dev      # http://localhost:3000
```

Local preview reads the data files in the repo; submitting moves or trades from it talks to the real Worker
(`localhost:3000` is an allowed origin), so use real passwords with care.

## Pages

| Page | Purpose |
| --- | --- |
| Team Standings | Division standings and overall rankings |
| Team Information | Team details, cash, salaries, roster summaries |
| Draft Results | Draft results and draft order |
| Team Statistics | Player performance and fantasy statistics by team |
| Team Roster | Rosters by period; **Next Period** tab lets a GM submit lineup moves (password required) |
| Overall Stats | Cumulative stats across periods |
| Compare Teams | Compare two teams and **propose or counter a trade** (password required) |
| My Account | A GM changes their own password and notification email; the commissioner resets forgotten passwords |
| Trades | A GM's inbox (accept / decline / counter / withdraw), the public trade log, and a commissioner view of all proposals |
| Stats Visualizations | Charts |
| Playoffs / Playoff Statistics | Bracket and team-vs-team playoff stats |

A season selector applies to every page; seasons are defined in `src/data/static/seasons.csv`.

## Repository layout

```
.
├─ src/
│  ├─ *.md                     # dashboard pages
│  ├─ components/              # shared JS: loadfiles.js (stats, seasons), trades.js (trade checks), ...
│  └─ data/
│     ├─ *.json.js, *.csv.js   # build-time data loaders (CSV -> JSON for the pages)
│     └─ static/
│        ├─ seasons.csv        # list of seasons and which is current
│        └─ <season>/          # one folder per season (e.g. 2026-27)
│           ├─ owners.csv, team_info.csv, team_cash.csv, contracts.csv, player_info.csv
│           ├─ draft_picks.csv, draft_order.csv, draft_results.csv, periods.csv
│           ├─ stats/          # stats_pNN.csv (written daily by the Read Stats workflow)
│           ├─ rosters/        # rosters_pNN.csv (written when the commissioner starts a period)
│           ├─ moves/          # moves_pNN.json (lineup moves submitted by GMs for the next period)
│           └─ trades/         # trades_pNN.json (accepted trades; the public trade log)
├─ worker/                     # Cloudflare Worker + D1 schema (roster moves, trades, emails)
├─ .github/
│  ├─ workflows/               # Read Stats, Apply Roster Moves, Record Trades, Deploy
│  └─ scripts/                 # scripts those workflows run (+ tests)
├─ FHLScripts/                 # TypeScript stats scraper used by the Read Stats workflow
├─ docs/ARCHITECTURE.md        # the system overview
├─ observablehq.config.js      # navigation and app config
├─ updateRoster.js, countActiveRoster.js   # local roster utilities (see ROSTER_UTILITIES.md)
└─ current -> src/data/static/<current season>   # symlink used by the local utilities
```

## How data gets in (summary)

- **Stats** are fetched automatically every day by the **Read Stats** workflow and committed.
- **Lineup moves** and **trades** are submitted from the site to the Worker, which checks the GM's password, enforces
  the rules and triggers GitHub workflows that commit the result. Pending trade proposals live in D1 and are private;
  accepted trades are committed to the repo.
- **Every commit** redeploys the site through the **Deploy** workflow.
- **A new period** starts when the commissioner runs **Apply Roster Moves** (materialize) from the Actions tab.

The full story, with diagrams and a table of secrets, is in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## FHL concepts

- **Periods:** numbered scoring periods (`P01`, `P02`, ...), up to 25 per season. Playoffs use rounds `r01`-`r04`
  (`stats_playoff_rNN.csv`, matchups in `playoff_bracket.csv`, format `round,matchup,team1,team2`).
- **Fantasy stats:**
  - D-Stat = `blocks + takeaways - giveaways + (toi / divisor)` (divisor 20 for defensemen, 30 for forwards)
  - G-Stat = `2*wins + ties + 2*shutouts + 0.15*shots_against - goals_against`
  - Toughness = `pim + hits`
- **Positions:** NHL positions are mapped to F, D or G. Ages use a September 15 cutoff (`ageCutoff` in `seasons.csv`).
- **Lineups and trades:** a lineup is exactly 20 active players (6-7 D, 2 G); a roster is 20-36 players. A trade takes
  effect in the **next** period's roster, and only if both GMs agree.

## Common tasks

| Task | How |
| --- | --- |
| Preview locally | `npm run dev` |
| Build the site | `npm run build` (output in `dist/`) |
| Clear the data-loader cache | `npm run clean` |
| Run all tests | `node --test worker/test/*.mjs .github/scripts/test/trades-lib.test.mjs test/trades-component.test.mjs` |
| Start a new period | Actions -> **Apply Roster Moves** -> Run workflow |
| Re-fetch stats | Actions -> **Read Stats** -> Run workflow (optional season/period) |
| Redeploy the site | Actions -> **Deploy** -> Run workflow |
| Deploy Worker changes | `cd worker && npx wrangler deploy` (not automatic) |
| Change a GM's password/email | The GM does it on **My Account**; for a forgotten password the commissioner uses the Commissioner section of that page (no repo edit) |

## Technical stack

Observable Framework, d3-dsv, GitHub Pages, GitHub Actions, Cloudflare Workers + D1, EmailJS, optional Discord webhook.

> **Note:** GM passwords (hashed) and emails live in the Worker's D1 database, not in the repository or on the site;
> `owners.csv` holds only public owner names and locations. See the security notes in
> [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#security-notes-and-known-limitations).
