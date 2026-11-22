// Run with: node --test test/transactions.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanTransaction, applyTransactions, transactionProblem } from "../src/components/transactionRules.js";
import { applyPendingTransactions, pendingTransactions, parseTransactionLines, describeTransaction } from "../src/components/transactions.js";

const id = (n) => `00000000-0000-0000-0000-00000000000${n}`;
const tx = (n, type, team, player, extra = {}) => ({ id: id(n), type, team, player, at: `2026-11-19T10:00:0${n}Z`, ...(type === "sign" ? { salary: 3, contract: "C-27" } : {}), ...extra });

test("cleanTransaction validates and normalizes", () => {
  assert.deepEqual(cleanTransaction({ ...tx(1, "sign", "ANA", "a1"), extra: "x" }), tx(1, "sign", "ANA", "a1"));
  assert.deepEqual(cleanTransaction(tx(1, "waive", "ANA", "a1", { salary: 9 })), tx(1, "waive", "ANA", "a1"));
  assert.throws(() => cleanTransaction(tx(1, "sign", "ANA", "a1", { salary: -1 })));
  assert.throws(() => cleanTransaction(tx(1, "sign", "ANA", "a1", { salary: 1.5 })));
  assert.throws(() => cleanTransaction(tx(1, "sign", "ANA", "a1", { contract: "bad contract!" })));
  assert.throws(() => cleanTransaction(tx(1, "trade", "ANA", "a1")));
  assert.throws(() => cleanTransaction(tx(1, "waive", "ana", "a1")));
  assert.throws(() => cleanTransaction({ ...tx(1, "waive", "ANA", "a1"), id: "nope" }));
});

test("transactionProblem: sign needs a free agent, waive needs the player on that team", () => {
  const state = { playerOwner: (p) => ({ a1: "ANA" })[p] };
  assert.equal(transactionProblem(tx(1, "sign", "BOS", "fa1"), state), null);
  assert.match(transactionProblem(tx(1, "sign", "BOS", "a1"), state), /already on ANA/);
  assert.equal(transactionProblem(tx(1, "waive", "ANA", "a1"), state), null);
  assert.match(transactionProblem(tx(1, "waive", "BOS", "a1"), state), /not BOS/);
  assert.match(transactionProblem(tx(1, "waive", "ANA", "nobody"), state), /not on any roster/);
});

test("applyTransactions: waive then claim by another team, in time order; flags are set and idempotent", () => {
  const rows = [{ ID: "a1", ABBR: "ANA", RESERVE: "" }, { ID: "b1", ABBR: "BOS", RESERVE: "" }];
  const txs = [tx(2, "sign", "BOS", "a1"), tx(1, "waive", "ANA", "a1"), tx(3, "sign", "ANA", "b1")];
  const r = applyTransactions(rows, txs, "NOW");
  assert.deepEqual(r.applied, [id(1), id(2)]);
  assert.equal(r.skipped.length, 1); // b1 is on BOS
  assert.deepEqual(rows, [{ ID: "b1", ABBR: "BOS", RESERVE: "" }, { ID: "a1", ABBR: "BOS", RESERVE: "R" }]);
  assert.equal(txs[0].appliedAt, "NOW");
  assert.ok(txs[2].skipped);
  // run again from the same start: the original appliedAt is kept
  const again = [{ ID: "a1", ABBR: "ANA", RESERVE: "" }, { ID: "b1", ABBR: "BOS", RESERVE: "" }];
  applyTransactions(again, txs, "LATER");
  assert.equal(txs[0].appliedAt, "NOW");
});

const row = (id, Position = "F", Reserve = "", Salary = 1) => ({ PLAYER_ID: id, Position, Reserve, Salary });
const base = { ANA: [row("a1", "D", "", 5), row("a2", "F", "R", 3)], BOS: [row("b1", "G", "", 2)] };
const signed = { PLAYER_ID: "fa1", Name: "Free Agent", Position: "F", Salary: 4, Contract: "C-27" };
const run = (transactions) => applyPendingTransactions({ abbrs: ["ANA", "BOS"], rosterOf: (a) => base[a], transactions });

test("page overlay: waived leave, signed join in reserve tagged, salary tracked, inputs untouched", () => {
  const r = run([{ ...tx(1, "waive", "ANA", "a1"), name: "x" }, { ...tx(2, "sign", "ANA", "fa1", { salary: 4 }), row: signed }]);
  assert.deepEqual(r.roster.get("ANA").map((p) => p.PLAYER_ID), ["a2", "fa1"]);
  const s = r.roster.get("ANA").find((p) => p.PLAYER_ID === "fa1");
  assert.equal(s.Reserve, "R");
  assert.equal(s.Acquired, "FA signing");
  assert.equal(r.salaryDelta.get("ANA"), -5 + 4);
  assert.equal(base.ANA.length, 2);
});

test("page overlay: stale data is ignored (already rostered signing, waive of someone not there)", () => {
  const r = run([{ ...tx(1, "sign", "ANA", "b1"), row: { ...signed, PLAYER_ID: "b1" } }, tx(2, "waive", "ANA", "zzz")]);
  assert.equal(r.roster.get("ANA").length, 2);
  assert.equal(r.salaryDelta.get("ANA"), 0);
});

test("pendingTransactions: next period only, skipped ones dropped", () => {
  const data = { data: { "2026-27": [{ ...tx(1, "waive", "ANA", "a1"), period: 8 }, { ...tx(2, "waive", "ANA", "a2"), period: 7 }, { ...tx(3, "waive", "BOS", "b1"), period: 8, skipped: "x" }] } };
  assert.deepEqual(pendingTransactions(data, "2026-27", 8).map((t) => t.id), [id(1)]);
  assert.deepEqual(pendingTransactions(data, "2027-28", 8), []);
});

const claim = (n, team, from, player) => ({ ...tx(n, "waive", team, player), type: "claim", from });

test("claim: validated like a trade (player on `from`), keeps reserve status, applies in order with other transactions", () => {
  assert.deepEqual(cleanTransaction({ ...claim(1, "BOS", "ANA", "a1"), salary: 9 }), claim(1, "BOS", "ANA", "a1"));
  assert.throws(() => cleanTransaction(claim(1, "BOS", "BOS", "a1")));
  assert.throws(() => cleanTransaction({ ...claim(1, "BOS", "ANA", "a1"), from: undefined }));
  const state = { playerOwner: (p) => ({ a1: "ANA" })[p] };
  assert.equal(transactionProblem(claim(1, "BOS", "ANA", "a1"), state), null);
  assert.match(transactionProblem(claim(1, "BOS", "CAR", "a1"), state), /not CAR/);
  const rows = [{ ID: "a1", ABBR: "ANA", RESERVE: "R" }];
  const txs = [claim(1, "BOS", "ANA", "a1"), tx(2, "waive", "BOS", "a1")];
  assert.equal(applyTransactions(rows, [txs[0]], "NOW").applied.length, 1);
  assert.deepEqual(rows, [{ ID: "a1", ABBR: "BOS", RESERVE: "R" }]);
  const again = [{ ID: "a1", ABBR: "ANA", RESERVE: "" }];
  assert.equal(applyTransactions(again, txs, "NOW").applied.length, 2); // claimed by BOS, then cut by BOS
  assert.deepEqual(again, []);
});

test("page overlay: a claim moves the player with salary and status, tagged", () => {
  const r = run([{ ...claim(1, "BOS", "ANA", "a1"), name: "A1", from: "ANA" }]);
  assert.deepEqual(r.roster.get("ANA").map((p) => p.PLAYER_ID), ["a2"]);
  const c = r.roster.get("BOS").find((p) => p.PLAYER_ID === "a1");
  assert.equal(c.Acquired, "waiver claim from ANA");
  assert.equal(c.Reserve, "");
  assert.equal(r.salaryDelta.get("ANA"), -5);
  assert.equal(r.salaryDelta.get("BOS"), 5);
  assert.equal(run([claim(1, "BOS", "CAR", "a1")]).roster.get("BOS").length, 1); // stale: not on CAR, ignored
  assert.equal(describeTransaction({ type: "claim", name: "A1", from: "ANA" }), "claimed A1 off waivers from ANA");
});

test("parseTransactionLines: matches names to the right kind of player, reports the rest", () => {
  const players = [{ id: "j1", name: "José Smith", pos: "F" }, { id: "b1", name: "Bob Jones", pos: "D" }, { id: "f1", name: "Free Guy", pos: "G" }, { id: "b2", name: "Bob Jones", pos: "F" }];
  const own = { j1: "ANA", b1: "BOS" };
  const r = parseTransactionLines("waive ana jose smith\nclaim ana from bos Bob Jones\nsign bos Free Guy $3\n# note\n\nsign bos José Smith 2\nwaive ANA\nfoo bar\nsign CAR Bob Jones 4", { players, ownerOf: (id) => own[id] });
  assert.deepEqual(r.items.map((i) => [i.type, i.team, i.player, i.salary, i.from]), [
    ["waive", "ANA", "j1", undefined, undefined],
    ["claim", "ANA", "b1", undefined, "BOS"],
    ["sign", "BOS", "f1", 3, undefined],
    ["sign", "CAR", "b2", 4, undefined], // two Bob Joneses, only one is a free agent
  ]);
  assert.deepEqual(r.errors.map((e) => e.line), ["sign bos José Smith 2", "waive ANA", "foo bar"]);
});

test("parseTransactionLines reads the FHL Trader waiver report as pasted", () => {
  const players = [
    { id: "smith1", name: "Gabe Smith", pos: "F" }, { id: "ing1", name: "Connor Ingram", pos: "G" },
    { id: "mol1", name: "Oscar Fisker Molgaard", pos: "F" }, { id: "bd1", name: "Jacob Bernard-Docker", pos: "D" },
    { id: "gone1", name: "Nobody Here", pos: "D" },
  ];
  const own = { smith1: "BUF", ing1: "BOS", mol1: "PHI", bd1: "NJD" };
  const report = `CLAIMED PLAYERS
---------------
BUF Gabe Smith (F)  -- Claimed by CAR (1 claim received) 

WAIVED PLAYERS
---------------------------
BOS Connor Ingram         (G) $6  C-28 cost: (1/2)x$6x(43/25)= $5.16
NJD Jacob Bernard-Docker  (D) $14 C-27 cost: (1/2)x$14x(18/25)= $5.04
PHI Oscar Fisker Molgaard (F) $4  U22  cost: $0
SEA Nobody Here           (D) $1  C-27 cost: $0
waive BOS Connor Ingram`;
  const r = parseTransactionLines(report, { players, ownerOf: (id) => own[id] });
  assert.deepEqual(r.items.map((i) => [i.type, i.team, i.from, i.player]), [
    ["claim", "CAR", "BUF", "smith1"],
    ["waive", "BOS", undefined, "ing1"],
    ["waive", "NJD", undefined, "bd1"],
    ["waive", "PHI", undefined, "mol1"],
    ["waive", "BOS", undefined, "ing1"], // a plain line still works after a report section (the Worker rejects the duplicate)
  ]);
  assert.equal(r.errors.length, 1);
  assert.match(r.errors[0].line, /^SEA Nobody Here/);
  assert.match(r.errors[0].message, /not on SEA/);
  assert.match(parseTransactionLines("BOS Connor Ingram (G) $6", { players, ownerOf: () => "BOS" }).errors[0].message, /CLAIMED \/ WAIVED/);
});

test("page overlay: waiver cuts add up their cost per team (cash comes off from the next period)", () => {
  const r = run([{ ...tx(1, "waive", "ANA", "a1"), cost: 5.16 }, { ...tx(2, "waive", "ANA", "a2"), cost: 0.36 }, { ...tx(3, "waive", "BOS", "zzz"), cost: 9 }]);
  assert.equal(r.waiverCost.get("ANA"), 5.52);
  assert.equal(r.waiverCost.get("BOS"), 0); // stale cut (not on his roster) is not charged
  assert.equal(describeTransaction({ type: "waive", name: "A1", cost: 5.16 }), "waived A1 (costs $5.16)");
  assert.equal(describeTransaction({ type: "waive", name: "A1", cost: 0 }), "waived A1");
});
