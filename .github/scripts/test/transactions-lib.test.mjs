// Run with: node --test .github/scripts/test/transactions-lib.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { changeTransactions, upsertContractRows } from "../transactions-lib.mjs";

const id = (n) => `00000000-0000-0000-0000-00000000000${n}`;
const t = (n, type, team, player) => ({ id: id(n), type, team, player, at: `2026-11-19T10:00:0${n}Z`, ...(type === "sign" ? { salary: 2, contract: "C-27" } : {}) });
const base = [{ ID: "a1", ABBR: "ANA", RESERVE: "" }];

test("add is idempotent by id and validated against the latest roster plus earlier transactions", () => {
  const first = changeTransactions([], { add: [t(1, "waive", "ANA", "a1")] }, base);
  assert.equal(first.changed, true);
  assert.equal(changeTransactions(first.transactions, { add: [t(1, "waive", "ANA", "a1")] }, base).changed, false);
  assert.throws(() => changeTransactions(first.transactions, { add: [t(2, "waive", "ANA", "a1")] }, base), /not on any roster/);
  assert.equal(changeTransactions(first.transactions, { add: [t(2, "sign", "BOS", "a1")] }, base).changed, true); // claim after the cut
});

test("a batch is added in order and checked as a whole; a bad line rejects the batch", () => {
  const batch = [t(1, "waive", "ANA", "a1"), { ...t(2, "claim", "BOS", "b1"), from: "CAR" }];
  const rows = [...base, { ID: "b1", ABBR: "CAR", RESERVE: "R" }];
  const r = changeTransactions([], { add: batch }, rows);
  assert.deepEqual(r.transactions.map((x) => x.id), [id(1), id(2)]);
  assert.throws(() => changeTransactions([], { add: [...batch, t(3, "waive", "ANA", "a1")] }, rows), /not on any roster/);
  assert.throws(() => changeTransactions([], { add: [{ ...batch[1], from: "BOS" }] }, rows), /Invalid from team/); // from == team
  assert.throws(() => changeTransactions([], { add: "x" }, rows));
});

test("remove drops one, and refuses if a later transaction depended on it", () => {
  const list = [t(1, "waive", "ANA", "a1"), t(2, "sign", "BOS", "a1")];
  assert.throws(() => changeTransactions(list, { remove: [id(1)] }, base), /already on ANA/);
  const r = changeTransactions(list, { remove: [id(2)] }, base);
  assert.deepEqual(r.transactions.map((x) => x.id), [id(1)]);
  assert.equal(changeTransactions(list, { remove: [id(9)] }, base).changed, false);
});

test("upsertContractRows appends, replaces a same-period row, keeps CRLF", () => {
  const text = "ID,Salary,Contract,Period\r\nx01,1,C-27\r\ny01,5,C-27,3\r\n";
  const once = upsertContractRows(text, [{ ID: "a1", Salary: 2, Contract: "C-27" }], 8);
  assert.equal(once, "ID,Salary,Contract,Period\r\nx01,1,C-27\r\ny01,5,C-27,3\r\na1,2,C-27,8\r\n");
  const twice = upsertContractRows(once, [{ ID: "a1", Salary: 4, Contract: "C-28" }], 8);
  assert.equal(twice, "ID,Salary,Contract,Period\r\nx01,1,C-27\r\ny01,5,C-27,3\r\na1,4,C-28,8\r\n");
  assert.equal(upsertContractRows(text, [], 8), text);
});
