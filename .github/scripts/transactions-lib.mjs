// File-level helpers for the commissioner's free-agent / waiver transactions (see src/components/transactionRules.js for
// the rules). Shared by record-transactions.mjs and apply-moves.mjs (materialize). No file or network access here.
import { cleanTransaction, applyTransactions, sortTransactions } from "../../src/components/transactionRules.js";

// Adds a transaction to the stored list (ignored if its id is already there) or removes one by id, then checks the
// whole list still applies cleanly to `baseRows` (the latest roster), so a removal can't strand a later transaction.
// Returns {transactions, changed}. Throws a sentence on anything wrong.
export function changeTransactions(existing, change, baseRows) {
  let list = existing.map((t) => ({ ...t }));
  let changed = false;
  if (change.action === "add") {
    const t = cleanTransaction(change.transaction);
    if (!list.some((x) => x.id === t.id)) { list.push(t); changed = true; }
  } else if (change.action === "remove") {
    const before = list.length;
    list = list.filter((x) => x.id !== change.id);
    changed = list.length !== before;
  } else throw new Error(`Unknown action ${change.action}`);
  const problem = applyTransactions(baseRows.map((r) => ({ ID: r.ID, ABBR: r.ABBR, RESERVE: r.RESERVE })), list.map((t) => ({ ...t })));
  if (problem.skipped.length) throw new Error(problem.skipped.map((s) => s.reason).join("; "));
  return { transactions: sortTransactions(list), changed };
}

// Adds contract rows (`ID,Salary,Contract,Period`) to contracts.csv text. A player who already has a row for that period
// (an earlier run of the same period) has it replaced rather than duplicated. Keeps the file's line endings.
export function upsertContractRows(text, rows, period) {
  if (!rows.length) return text;
  const nl = text.includes("\r\n") ? "\r\n" : "\n";
  const ids = new Set(rows.map((r) => r.ID));
  const [header, ...rest] = text.split(/\r?\n/).filter((l, i, all) => l !== "" || i < all.length - 1);
  const head = /\bPeriod\b/.test(header) ? header : `${header},Period`;
  const kept = rest.filter((l) => l && !(ids.has(l.split(",")[0]) && l.split(",")[3] === String(period)));
  return [head, ...kept, ...rows.map((r) => `${r.ID},${r.Salary},${r.Contract},${period}`)].join(nl) + nl;
}
