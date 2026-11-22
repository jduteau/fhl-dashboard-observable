// Run with: node --test test/transactions.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanTransaction, applyTransactions, transactionProblem } from "../src/components/transactionRules.js";
import { applyPendingTransactions, pendingTransactions } from "../src/components/transactions.js";

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
