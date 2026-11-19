# Roster-moves Worker

Flow: Roster page -> this Worker (checks password vs `owners.csv`) -> `repository_dispatch` ->
`Apply Roster Moves` workflow (validates, writes `src/data/static/<season>/moves/moves_pNN.json`) -> Deploy.

## Setup (once)
1. Create a fine-grained GitHub token for this repo only, with **Contents: Read and write**
   (needed for `repository_dispatch` and reading `owners.csv`).
2. `cd worker && npx wrangler secret put GITHUB_TOKEN` (paste the token)
3. Confirm `ALLOWED_ORIGIN` in `wrangler.toml` matches the Pages origin, then `npx wrangler deploy`.
4. Put the Worker URL in `src/Roster.md` (`WORKER_URL`).

## Trades (D1)
Endpoints (all `POST`, JSON, password checked against `owners.csv` like roster moves):
`/trades/propose`, `/trades/list`, `/trades/respond`. Pending proposals live in a D1 database and are only
returned to the two GMs involved; accepted trades are sent to GitHub as a `trade-approved` dispatch.

Setup (once):
1. `cd worker && npx wrangler d1 create fhl-trades` and paste the printed `database_id` into `wrangler.toml`.
2. `npx wrangler d1 execute fhl-trades --remote --file=schema.sql`
3. `npx wrangler deploy`

Request shapes (`season` must be the current season; `give` = what the proposer sends, `get` = what they receive):
- propose: `{season, team, password, to, give:{players:[id], picks:[{pick,season}]}, get:{...}, note?, counters?: tradeId}`
- list: `{season, team, password}` -> `{period, trades:[{id, from, to, status, give, get, ...}]}`
- respond: `{season, team, password, id, decision: "accept"|"decline"|"withdraw"}`

Rules enforced server-side: each side must own what it gives (latest roster + `draft_picks.csv`, current and
next season), both rosters must end with 20-36 players, assets in an accepted trade are locked, and a proposal
expires when the next period's roster file is created.

Tests (no Cloudflare account needed): `node --test worker/test/trades.test.mjs`

## Commissioner: start a new period
Run the **Apply Roster Moves** workflow manually (Actions tab). It writes `rosters_pNN.csv`
for the next period from the stored moves; teams with no moves carry over unchanged.
