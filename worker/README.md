# Roster-moves Worker

Flow: Roster page -> this Worker (checks password vs `owners.csv`) -> `repository_dispatch` ->
`Apply Roster Moves` workflow (validates, writes `src/data/static/<season>/moves/moves_pNN.json`) -> Deploy.

## Setup (once)
1. Create a fine-grained GitHub token for this repo only, with **Contents: Read and write**
   (needed for `repository_dispatch` and reading `owners.csv`).
2. `cd worker && npx wrangler secret put GITHUB_TOKEN` (paste the token)
3. Confirm `ALLOWED_ORIGIN` in `wrangler.toml` matches the Pages origin, then `npx wrangler deploy`.
4. Put the Worker URL in `src/Roster.md` (`WORKER_URL`).

## Commissioner: start a new period
Run the **Apply Roster Moves** workflow manually (Actions tab). It writes `rosters_pNN.csv`
for the next period from the stored moves; teams with no moves carry over unchanged.
