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

Rules enforced server-side: each side must own what it gives, both rosters must end with 20-36 players, and a
proposal expires when the next period's roster file is created. Ownership is the latest roster + `draft_picks.csv`
(current and next season) **with the already-accepted trades for the period applied in order**, so a player or pick a
team is about to receive can be traded onward in a later trade, while one it already gave away can't be offered again.
When a trade is accepted, other open proposals in which the same team gives any of the same assets become VOID.
The dashboard (Compare Teams, Trades, Roster) shows the same post-trade state from the trade log.

### Trade emails (EmailJS)
The Worker emails the GMs involved (addresses from `owners.csv`): a proposal or counter-offer goes to the other GM, an
accepted trade goes to both (with a reminder to check their lineup), a decline goes to the proposer and a withdrawal to
the recipient. If `LEAGUE_EMAIL` (in `wrangler.toml`) is set to a league-wide address, an accepted trade is also announced
there (one email per trade; it has no lineup advice and never includes the private note). Emails are sent after the response, and a failure is logged but never affects the trade. Nothing is sent
until EmailJS is set up:
1. In EmailJS, **Account > Security**: allow API calls from non-browser applications (the Worker is not a browser).
2. Create a template (e.g. "FHL Trades") with To Email `{{to_email}}`, Subject `{{subject}}` and HTML content
   `<div style="white-space: pre-line; font-family: sans-serif;">{{message}}</div>` (`{{to_name}}` is also available).
3. Put the template's id in `EMAILJS_TEMPLATE_ID` in `wrangler.toml`.
4. `cd worker && npx wrangler secret put EMAILJS_PRIVATE_KEY` and paste the private key from **Account > General**
   (never commit it or paste it in chat). The service id and public key are already in `wrangler.toml`.
5. `npx wrangler deploy`.

### From accepted trade to new roster
1. When the second GM accepts, the Worker sends a `trade-approved` dispatch. It always carries **all** accepted trades for
   the upcoming period (GitHub keeps only one queued run per workflow, so a single trade per run could be lost).
2. The **Record Trades** workflow (`.github/workflows/record-trades.yml`) merges them by id into
   `src/data/static/<season>/trades/trades_pNN.json` (this is the public trade log) and triggers a deploy.
3. The **Roster page's Next Period tab** shows the roster *after* the agreed trades (players sent away are gone,
   acquired players are added with their current active/reserve status), and a submitted lineup is validated against that
   post-trade roster (exactly 20 active, 6-7 D, 2 G). So a GM sets the lineup for the roster they will really have.
4. When the commissioner runs **Apply Roster Moves** (materialize) for the next period, it applies the trades first:
   players change team in `rosters_pNN.csv` and traded picks change owner in the `draft_picks.csv` files. Each trade is
   re-checked (ownership, 20-36 players) and skipped with a warning in the run log if it can no longer happen;
   `appliedAt` / `skipped` are written into the trades file. Then each team's lineup moves are applied. If a trade was
   agreed *after* a GM submitted (so their submission names players they no longer have), the moves that no longer fit
   are ignored with a warning, and if the rest isn't a legal lineup the team keeps its current lineup; the Roster page
   warns that GM to re-check and resubmit.
5. If a trade is accepted but never shows up in the trade log (the workflow failed), either GM can press **Re-send**
   on the Trades page (`POST /trades/republish`), which re-dispatches every accepted trade for the period.

Tests (no Cloudflare account needed):
`node --test worker/test/trades.test.mjs .github/scripts/test/trades-lib.test.mjs`

## Commissioner: start a new period
Run the **Apply Roster Moves** workflow manually (Actions tab). It writes `rosters_pNN.csv`
for the next period from the stored moves; teams with no moves carry over unchanged.
