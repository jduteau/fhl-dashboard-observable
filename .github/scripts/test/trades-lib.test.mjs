// Run with: node --test .github/scripts/test/trades-lib.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanTrade, mergeTrades, applyTrades, updatePicksText, reconcileMoves } from "../trades-lib.mjs";

const uuid = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const players = (team, n) => Array.from({ length: n }, (_, i) => `${team.toLowerCase()}${String(i + 1).padStart(2, "0")}`);
const league = (sizes) => Object.entries(sizes).flatMap(([t, n]) => players(t, n).map((ID, i) => ({ ID, ABBR: t, RESERVE: i % 2 ? "R" : "" })));
const picks = () => new Map([["2026-27", new Map([["ANA1", "ANA"], ["BOS1", "BOS"], ["WPG2", "ANA"]])], ["2027-28", new Map([["ANA1", "ANA"]])]]);
const trade = (n, over = {}) => ({ id: uuid(n), from: "ANA", to: "BOS", give: { players: [], picks: [] }, get: { players: [], picks: [] }, acceptedAt: `2026-11-19T10:00:0${n}.000Z`, ...over });

test("cleanTrade accepts a good trade and rejects bad ones", () => {
  const ok = trade(1, { give: { players: ["ana01"], picks: [{ pick: "WPG2", season: "2026-27", extra: "dropped" }] } });
  assert.deepEqual(cleanTrade(ok).give.picks, [{ pick: "WPG2", season: "2026-27" }]);
  assert.throws(() => cleanTrade(trade(1)), /empty/);
  assert.throws(() => cleanTrade({ ...ok, id: "nope" }), /id/);
  assert.throws(() => cleanTrade({ ...ok, to: "ANA" }), /teams/);
  assert.throws(() => cleanTrade({ ...ok, give: { players: ["../etc"] } }), /players/);
  assert.throws(() => cleanTrade({ ...ok, acceptedAt: "yesterday" }), /acceptedAt/);
});

test("mergeTrades is idempotent and never overwrites stored state", () => {
  const a = trade(1, { give: { players: ["ana01"] } });
  const b = trade(2, { give: { players: ["ana02"] } });
  const first = mergeTrades([], [b, a]);
  assert.deepEqual(first.trades.map((t) => t.id), [uuid(1), uuid(2)]); // oldest first
  first.trades[0].appliedAt = "2026-11-26T00:00:00Z";
  const again = mergeTrades(first.trades, [a, b]);
  assert.deepEqual(again.added, []);
  assert.equal(again.trades[0].appliedAt, "2026-11-26T00:00:00Z");
  assert.deepEqual(mergeTrades(first.trades, [trade(3, { give: { players: ["ana03"] } })]).added, [uuid(3)]);
});

test("applyTrades swaps players and picks, keeping reserve designations", () => {
  const rows = league({ ANA: 21, BOS: 20 });
  const reserve = (id) => rows.find((r) => r.ID === id).RESERVE;
  const [r1, r2] = [reserve("ana02"), reserve("bos01")];
  const t = trade(1, { give: { players: ["ana02"], picks: [{ pick: "WPG2", season: "2026-27" }] }, get: { players: ["bos01"], picks: [{ pick: "BOS1", season: "2026-27" }] } });
  const p = picks();
  const res = applyTrades(rows, [t], p, "NOW");
  assert.deepEqual(res, { applied: [uuid(1)], skipped: [] });
  assert.equal(rows.find((r) => r.ID === "ana02").ABBR, "BOS");
  assert.equal(rows.find((r) => r.ID === "bos01").ABBR, "ANA");
  assert.equal(reserve("ana02"), r1); // designation travels with the player
  assert.equal(reserve("bos01"), r2);
  assert.equal(p.get("2026-27").get("WPG2"), "BOS");
  assert.equal(p.get("2026-27").get("BOS1"), "ANA");
  assert.equal(t.appliedAt, "NOW");
});

test("applyTrades skips a trade whose assets moved, without changing anything", () => {
  const rows = league({ ANA: 21, BOS: 20, CAR: 20 });
  const p = picks();
  // t1 sends ana01 to BOS; t2 (later) also tries to send ana01 to CAR
  const t1 = trade(1, { give: { players: ["ana01"] }, get: { players: ["bos01"] } });
  const t2 = trade(2, { to: "CAR", give: { players: ["ana01"] }, get: { players: ["car01"] } });
  const res = applyTrades(rows, [t2, t1], p);
  assert.deepEqual(res.applied, [uuid(1)]);
  assert.equal(res.skipped[0].id, uuid(2));
  assert.match(t2.skipped, /ana01 is not on ANA/);
  assert.equal(rows.find((r) => r.ID === "car01").ABBR, "CAR"); // untouched by the skipped trade
  // a pick that is no longer owned
  const t3 = trade(3, { give: { picks: [{ pick: "BOS1", season: "2026-27" }] } });
  applyTrades(rows, [t3], p);
  assert.match(t3.skipped, /ANA does not own BOS1/);
  const t4 = trade(4, { give: { picks: [{ pick: "ANA9", season: "2026-27" }] } });
  applyTrades(rows, [t4], p);
  assert.match(t4.skipped, /does not exist/);
});

test("applyTrades enforces 20-36 players, counting earlier trades in the same batch", () => {
  const rows = league({ ANA: 20, BOS: 36, CAR: 30 });
  const p = picks();
  const t1 = trade(1, { give: { players: ["ana01"] } });            // ANA 19 -> too few
  const t2 = trade(2, { get: { players: ["bos01"] } });             // ANA 21, BOS 35 -> ok
  const t3 = trade(3, { get: { players: ["bos02", "bos03"] } });    // ANA 23, BOS 33 -> ok
  const t4 = trade(4, { from: "CAR", to: "BOS", give: { players: players("CAR", 4) } }); // BOS 37 -> too many
  const t5 = trade(5, { from: "CAR", to: "BOS", give: { players: players("CAR", 3) } }); // BOS 36 -> ok (limit is inclusive)
  const res = applyTrades(rows, [t1, t2, t3, t4, t5], p);
  assert.deepEqual(res.applied, [uuid(2), uuid(3), uuid(5)]);
  assert.match(t1.skipped, /ANA would have 19/);
  assert.match(t4.skipped, /BOS would have 37/);
  assert.equal(rows.filter((r) => r.ABBR === "ANA").length, 23);
  assert.equal(rows.filter((r) => r.ABBR === "BOS").length, 36);
});

test("applyTrades re-evaluates stale flags from an earlier run", () => {
  const rows = league({ ANA: 21, BOS: 20 });
  const t = trade(1, { give: { players: ["ana01"] }, skipped: "old reason", appliedAt: "old" });
  applyTrades(rows, [t], picks(), "NOW");
  assert.equal(t.skipped, undefined);
  assert.equal(t.appliedAt, "NOW");
});

test("updatePicksText only touches traded picks and preserves CRLF/BOM", () => {
  const text = "﻿PICK,OWNER\r\nANA1,ANA\r\nBOS1,BOS\r\nWPG2,ANA\r\n";
  const out = updatePicksText(text, new Map([["WPG2", "BOS"], ["ANA1", "ANA"]]));
  assert.equal(out, "﻿PICK,OWNER\r\nANA1,ANA\r\nBOS1,BOS\r\nWPG2,BOS\r\n");
  assert.equal(updatePicksText("PICK,OWNER\nANA1,ANA\n", new Map([["ANA1", "BOS"]])), "PICK,OWNER\nANA1,BOS\n");
});

test("reconcileMoves keeps moves that still fit the post-trade roster and reports the rest", () => {
  const rows = [
    { ID: "a1", ABBR: "ANA", RESERVE: "R" },   // reserve on ANA
    { ID: "a2", ABBR: "ANA", RESERVE: "" },    // active on ANA
    { ID: "b1", ABBR: "ANA", RESERVE: "R" },   // acquired by ANA in a trade, still reserve
    { ID: "c1", ABBR: "BOS", RESERVE: "R" },   // another team's player
  ];
  const r = reconcileMoves(rows, "ANA", ["a1", "b1", "gone1", "a2", "c1"], ["a2", "a1", "gone2"]);
  assert.deepEqual(r.promote, ["a1", "b1"]);   // a2 is already active, c1/gone1 aren't ANA reserves
  assert.deepEqual(r.demote, ["a2"]);          // a1 is a reserve, gone2 doesn't exist
  assert.deepEqual(r.dropped.sort(), ["a1", "a2", "c1", "gone1", "gone2"].sort());
  assert.deepEqual(reconcileMoves(rows, "ANA", ["a1"], ["a2"]), { promote: ["a1"], demote: ["a2"], dropped: [] });
});

test("applyTrades replays a chain in order: an asset acquired in one trade can be traded onward in a later one", () => {
  const rows = league({ ANA: 21, BOS: 20, CAR: 20 });
  const p = picks();
  const t1 = trade(1, { give: { players: ["ana01"], picks: [{ pick: "WPG2", season: "2026-27" }] }, get: { players: ["bos01"] } });
  const t2 = trade(2, { from: "BOS", to: "CAR", give: { players: ["ana01"], picks: [{ pick: "WPG2", season: "2026-27" }] }, get: { players: ["car01"] } });
  const res = applyTrades(rows, [t2, t1], p); // given out of order; applied by acceptedAt
  assert.deepEqual(res.applied, [uuid(1), uuid(2)]);
  assert.equal(rows.find((r) => r.ID === "ana01").ABBR, "CAR");
  assert.equal(rows.find((r) => r.ID === "bos01").ABBR, "ANA");
  assert.equal(rows.find((r) => r.ID === "car01").ABBR, "BOS");
  assert.equal(p.get("2026-27").get("WPG2"), "CAR");
  // if the first trade were missing, the onward trade can't happen
  const lone = applyTrades(league({ ANA: 21, BOS: 20, CAR: 20 }), [trade(2, { from: "BOS", to: "CAR", give: { players: ["ana01"] } })], picks());
  assert.equal(lone.skipped.length, 1);
});
