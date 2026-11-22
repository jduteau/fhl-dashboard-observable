// File-level helpers for the commissioner's free-agent / waiver transactions (see src/components/transactionRules.js for
// the rules). Shared by record-transactions.mjs and apply-moves.mjs (materialize). No file or network access here.
import { cleanTransaction, applyTransactions, sortTransactions } from "../../src/components/transactionRules.js";

// Adds a batch of transactions to the stored list (ones whose id is already there are ignored) and/or removes some by id,
// then checks the whole list still applies cleanly to `baseRows` (the latest roster), so a removal can't strand a later
// transaction. change = {add?: [transaction], remove?: [id]}.
// Returns {transactions, changed}. Throws a sentence on anything wrong.
export function changeTransactions(existing, change, baseRows) {
  let list = existing.map((t) => ({ ...t }));
  let changed = false;
  const remove = change.remove ?? [];
  if (!Array.isArray(remove) || !Array.isArray(change.add ?? [])) throw new Error("add and remove must be lists");
  if (remove.length) {
    const before = list.length;
    list = list.filter((x) => !remove.includes(x.id));
    changed = list.length !== before;
  }
  for (const raw of change.add ?? []) {
    const t = cleanTransaction(raw);
    if (!list.some((x) => x.id === t.id)) { list.push(t); changed = true; }
  }
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
