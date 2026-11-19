-- D1 schema for trade proposals. Apply with:
--   npx wrangler d1 execute fhl-trades --remote --file=schema.sql
-- (use --local instead of --remote for a local dev database)
--
-- Pending proposals live ONLY here (never in the repo / public site). Accepted trades are also
-- published to the repo by the Worker (see trades.js) so they appear in the public trade log.
--
-- status: PROPOSED -> ACCEPTED | DECLINED | WITHDRAWN | COUNTERED | VOID
--   VOID = an asset in it was committed to another accepted trade.
-- "Expired" is not stored: a PROPOSED trade whose `period` already has a roster file is shown as EXPIRED.

CREATE TABLE IF NOT EXISTS trades (
  id           TEXT PRIMARY KEY,
  season       TEXT NOT NULL,
  period       INTEGER NOT NULL,           -- the period whose roster the trade takes effect in
  from_team    TEXT NOT NULL,              -- proposer
  to_team      TEXT NOT NULL,              -- the GM who must accept
  status       TEXT NOT NULL DEFAULT 'PROPOSED'
               CHECK (status IN ('PROPOSED', 'ACCEPTED', 'DECLINED', 'WITHDRAWN', 'COUNTERED', 'VOID')),
  note         TEXT,
  counters     TEXT,                       -- id of the proposal this one is a counter-offer to
  created_at   TEXT NOT NULL,
  responded_at TEXT,
  published    INTEGER NOT NULL DEFAULT 0  -- 1 once the accepted trade was sent to the GitHub workflow
);
CREATE INDEX IF NOT EXISTS trades_from ON trades (from_team, season);
CREATE INDEX IF NOT EXISTS trades_to ON trades (to_team, season);
CREATE INDEX IF NOT EXISTS trades_status ON trades (status, season, period);

CREATE TABLE IF NOT EXISTS trade_items (
  trade_id    TEXT NOT NULL REFERENCES trades (id),
  kind        TEXT NOT NULL CHECK (kind IN ('player', 'pick')),
  ref         TEXT NOT NULL,               -- player id (e.g. berglja01) or pick id (e.g. WPG2)
  pick_season TEXT NOT NULL DEFAULT '',    -- draft season for picks ('' for players)
  giver       TEXT NOT NULL,
  receiver    TEXT NOT NULL,
  PRIMARY KEY (trade_id, kind, ref, pick_season)
);
CREATE INDEX IF NOT EXISTS trade_items_asset ON trade_items (kind, ref, pick_season);
