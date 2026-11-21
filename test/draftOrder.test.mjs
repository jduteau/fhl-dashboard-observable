// Run from the repo root with: node --test test/draftOrder.test.mjs
// Draft order: who picks first, from the regular season and the playoffs; and the tables built from it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeBaseOrder, buildDraftOrderRows } from "../src/components/draftOrderCompute.js";
import { buildSeasonDraftOrder } from "../src/components/draftHelpers.js";

// Eight teams. overallRank 1 = best. East: A1 B3 C5 D7. West: E2 F4 G6 H8. So A and E are the division winners.
const standings = { overallStandings: [
  ["A", "East", 1], ["B", "East", 3], ["C", "East", 5], ["D", "East", 7],
  ["E", "West", 2], ["F", "West", 4], ["G", "West", 6], ["H", "West", 8],
].map(([team, division, overallRank]) => ({ team, division, overallRank })) };
const matchups = (...pairs) => pairs.map(([team1, team2]) => ({ team1, team2 }));
const bracket = (r1, r3 = [], r4 = []) => ({ rounds: [{ matchups: matchups(...r1) }, { matchups: [] }, { matchups: matchups(...r3) }, { matchups: matchups(...r4) }] });
const finalResult = (a, b) => ({ 4: { matchups: [{ team1: { abbr: a[0], rankings: { total: a[1] } }, team2: { abbr: b[0], rankings: { total: b[1] } } }] } });

test("before the playoffs: the worst regular-season team picks first", () => {
  const order = computeBaseOrder(standings, { availableRounds: [], bracket: bracket([]), data: {} });
  assert.deepEqual(order, ["H", "D", "G", "C", "F", "B", "E", "A"]); // worst overall rank first: 8, 7, 6, 5, 4, 3, 2, 1
});

test("after round 1: missed the playoffs, then playoff teams (non-division winners before division winners)", () => {
  const playoffs = { availableRounds: [1], bracket: bracket([["A", "F"], ["B", "E"], ["C", "D"]]), data: {} };
  // G and H missed it; C, D, B, F made it without winning a division; E and A won theirs
  assert.deepEqual(computeBaseOrder(standings, playoffs), ["H", "G", "D", "C", "F", "B", "E", "A"]);
});

test("a finished playoff: conference-final losers, then the Cup runner-up, then the champion last", () => {
  const playoffs = {
    availableRounds: [1, 2, 3, 4],
    bracket: bracket([["A", "F"], ["B", "E"], ["C", "D"]], [["A", "B"], ["E", "F"]], [["A", "E"]]),
    data: finalResult(["A", 1], ["E", 2]), // A has the better overall standing in the final: A is champion
  };
  // missed: H G | lost early, not division winners: D C | conference-final losers: F B | runner-up: E | champion: A
  assert.deepEqual(computeBaseOrder(standings, playoffs), ["H", "G", "D", "C", "F", "B", "E", "A"]);
  const eWins = { ...playoffs, data: finalResult(["A", 2], ["E", 1]) };
  assert.deepEqual(computeBaseOrder(standings, eWins), ["H", "G", "D", "C", "F", "B", "A", "E"]); // E champion, A runner-up
});

test("an unsettled final (level overall standing) has no champion yet: both finalists, worst standing first", () => {
  const playoffs = {
    availableRounds: [1, 2, 3, 4],
    bracket: bracket([["A", "F"], ["B", "E"], ["C", "D"]], [["A", "B"], ["E", "F"]], [["A", "E"]]),
    data: finalResult(["A", 1], ["E", 1]),
  };
  assert.deepEqual(computeBaseOrder(standings, playoffs), ["H", "G", "D", "C", "F", "B", "E", "A"]);
});

test("a team barred from the playoffs still counts as having made them and lost early", () => {
  const playoffs = { availableRounds: [1], bracket: bracket([["A", "F"], ["B", "E"], ["C", "D"]]), data: {} };
  // G qualified on standings but was barred: it joins the early-exit playoff teams (D, G, C) rather than the non-qualifiers
  assert.deepEqual(computeBaseOrder(standings, playoffs, ["G"]), ["H", "D", "G", "C", "F", "B", "E", "A"]);
});

const file = (...rows) => rows.map(([ORDER, TEAM, ROUND]) => ({ ORDER: String(ORDER), TEAM, ROUND: String(ROUND) }));
const base = ["H", "D", "G", "C", "F", "B", "E", "A"];

test("draft order rows: the lottery winners pick first in round 1, everyone else in base order; round 2 is base order", () => {
  const rows = buildDraftOrderRows(base, file([1, "E", 1], [2, "A", 1]));
  const round = (r) => rows.filter((x) => x.ROUND === String(r)).map((x) => `${x.ORDER}:${x.TEAM}`);
  assert.deepEqual(round(1), ["1:E", "2:A", "3:H", "4:D", "5:G", "6:C", "7:F", "8:B"]);
  assert.deepEqual(round(2), ["1:H", "2:D", "3:G", "4:C", "5:F", "6:B", "7:E", "8:A"]);
  assert.equal(rows.length, 16);
});

test("a round that already lists every team (a draft already held) is kept as it is", () => {
  const held = ["B", "A", "C", "D", "E", "F", "G", "H"];
  const rows = buildDraftOrderRows(base, [...file(...held.map((t, i) => [i + 1, t, 1])), ...file(...held.slice().reverse().map((t, i) => [i + 1, t, 2]))]);
  assert.deepEqual(rows.filter((x) => x.ROUND === "1").map((x) => x.TEAM), held);
  assert.deepEqual(rows.filter((x) => x.ROUND === "2").map((x) => x.TEAM), held.slice().reverse());
});

test("no lottery winners yet: both rounds follow the base order", () => {
  const rows = buildDraftOrderRows(base, []);
  assert.deepEqual(rows.filter((x) => x.ROUND === "1").map((x) => x.TEAM), base);
  assert.deepEqual(rows.filter((x) => x.ROUND === "2").map((x) => x.TEAM), base);
});

// ---- The tables built from the order and who owns each pick (draftHelpers.js) ----

const teamInfo = [{ ABBR: "ANA", NAME: "Anaheim" }, { ABBR: "BOS", NAME: "Boston" }];
const order = [...file([1, "BOS", 1], [2, "ANA", 1]), ...file([1, "BOS", 2], [2, "ANA", 2])];
const picks = [ // ANA's round 1 pick belongs to BOS; BOS's round 2 pick to ANA; round 3 exists too
  ["ANA1", "BOS"], ["BOS1", "BOS"], ["ANA2", "ANA"], ["BOS2", "ANA"], ["ANA3", "ANA"], ["BOS3", "BOS"],
].map(([PICK, OWNER]) => ({ PICK, OWNER }));

test("draft tables: round 1 shows who owns each pick, later rounds are listed by the original team", () => {
  const t = buildSeasonDraftOrder(order, picks, teamInfo);
  assert.deepEqual(t.otherRoundNumbers, [2, 3]);
  assert.deepEqual(t.round1, [
    { order: 1, pick: "BOS", pickName: "Boston", owner: "BOS", ownerName: "Boston" },
    { order: 2, pick: "ANA", pickName: "Anaheim", owner: "BOS", ownerName: "Boston" }, // ANA's own pick, owned by BOS
  ]);
  assert.deepEqual(t.otherRounds.map((r) => [r.order, r.pick, r.r2, r.r3]), [[1, "BOS", "ANA", "BOS"], [2, "ANA", "ANA", "ANA"]]);
  assert.deepEqual(t.combined.map((r) => [r.order, r.r1pick, r.r1, r.r2pick, r.r2, r.r3]), [[1, "BOS", "BOS", "BOS", "ANA", "BOS"], [2, "ANA", "BOS", "ANA", "ANA", "ANA"]]);
});

test("draft tables: the flat list runs round by round in pick order, with original and current owners", () => {
  const { flat } = buildSeasonDraftOrder(order, picks, teamInfo);
  assert.deepEqual(flat.map((p) => `${p.round}.${p.order} ${p.pickLabel}->${p.team}`), [
    "1.1 BOS1->BOS", "1.2 ANA1->BOS", "2.1 BOS2->ANA", "2.2 ANA2->ANA", "3.1 BOS3->BOS", "3.2 ANA3->ANA",
  ]);
  assert.equal(flat[1].originalTeamName, "Anaheim");
  assert.equal(flat[1].teamName, "Boston");
});

test("a pick nobody owns shows as an em dash", () => {
  const t = buildSeasonDraftOrder(order, picks.filter((p) => p.PICK !== "ANA1"), teamInfo);
  assert.equal(t.round1[1].owner, "—");
  assert.equal(t.round1[1].ownerName, "—");
});
