// Free-agent signings, waiver cuts and waiver claims the commissioner records DURING a period. They take effect in the
// NEXT period's roster, like agreed trades, and are applied before them (in the order they were entered, then trades,
// then the GMs' lineup moves). Pure functions and constants, shared by the Worker, the
// GitHub scripts and the pages.
//
// A stored transaction (src/data/static/<season>/transactions/transactions_pNN.json, {"transactions": [...]}):
//   { id, type: "sign" | "waive" | "claim", team, player, salary?, contract?, from?, at,
//     appliedAt?  (set when the new period's roster was built with it),
//     skipped?    (set, with the reason, when it could no longer be applied) }
// "sign": the team adds a free agent, in reserve, on a new contract (salary + contract code, e.g. "C-27").
//         A waiver claim by another team is just a signing of the waived player.
// "waive": the team cuts the player; he is then on no FHL roster (a free agent).
// "claim": a waiver claim, i.e. a trade the commissioner makes by himself: the player moves from team `from` to `team`
//          with his contract and his active/reserve status unchanged.
import { TEAM, PLAYER } from "./tradeRules.js";

export const TRANSACTION_TYPES = ["sign", "waive", "claim"];
export const TRANSACTION_ID = /^[0-9a-f-]{36}$/; // a UUID
export const CONTRACT = /^[\w-]{1,12}$/; // C-27

const byTime = (a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id);
export const sortTransactions = (txs) => [...txs].sort(byTime);

// Validates and normalizes one transaction. Throws on anything unexpected.
export function cleanTransaction(t) {
  if (!t || !TRANSACTION_ID.test(t.id ?? "")) throw new Error("Invalid transaction id");
  if (!TRANSACTION_TYPES.includes(t.type)) throw new Error(`Invalid transaction type in ${t.id}`);
  if (!TEAM.test(t.team ?? "")) throw new Error(`Invalid team in transaction ${t.id}`);
  if (typeof t.player !== "string" || !PLAYER.test(t.player)) throw new Error(`Invalid player in transaction ${t.id}`);
  if (typeof t.at !== "string" || Number.isNaN(Date.parse(t.at))) throw new Error(`Invalid time in transaction ${t.id}`);
  const clean = { id: t.id, type: t.type, team: t.team, player: t.player };
  if (t.type === "sign") {
    const salary = Number(t.salary);
    if (!Number.isInteger(salary) || salary < 0 || salary > 1000) throw new Error(`Invalid salary in transaction ${t.id}`);
    if (typeof t.contract !== "string" || !CONTRACT.test(t.contract)) throw new Error(`Invalid contract in transaction ${t.id}`);
    clean.salary = salary;
    clean.contract = t.contract;
  }
  if (t.type === "claim") {
    if (!TEAM.test(t.from ?? "") || t.from === t.team) throw new Error(`Invalid from team in transaction ${t.id}`);
    clean.from = t.from;
  }
  clean.at = t.at;
  return clean;
}

// Why a transaction cannot happen right now, as a sentence, or null if it can.
//   state: {playerOwner(id) -> abbr or undefined (undefined = on no roster)}
export function transactionProblem(t, state) {
  const owner = state.playerOwner(t.player);
  if (t.type === "sign") return owner ? `${t.player} is already on ${owner}'s roster` : null;
  if (owner === undefined) return `${t.player} is not on any roster`;
  const expected = t.type === "claim" ? t.from : t.team; // a claim takes the player from `from`
  return owner === expected ? null : `${t.player} is on ${owner}'s roster, not ${expected}'s`;
}

// Applies transactions (oldest first) to roster rows, all-or-nothing each, skipping ones that no longer make sense.
//   rows: [{ID, ABBR, RESERVE}] - mutated: waived players are removed, signed players are added in reserve ("R")
// Mutates each transaction, setting appliedAt or skipped (a transaction applied before keeps its original appliedAt, so
// running this again changes nothing). Returns {applied: [id], skipped: [{id, reason}]}.
export function applyTransactions(rows, transactions, now = new Date().toISOString()) {
  const owners = new Map(rows.map((r) => [r.ID, r.ABBR]));
  const applied = [];
  const skipped = [];
  for (const t of sortTransactions(transactions)) {
    const previouslyAppliedAt = t.skipped ? undefined : t.appliedAt; // a flag left beside `skipped` is stale
    delete t.appliedAt;
    delete t.skipped;
    const problem = transactionProblem(t, { playerOwner: (id) => owners.get(id) });
    if (problem) {
      t.skipped = problem;
      skipped.push({ id: t.id, reason: problem });
      continue;
    }
    if (t.type === "sign") {
      rows.push({ ID: t.player, ABBR: t.team, RESERVE: "R" });
      owners.set(t.player, t.team);
    } else if (t.type === "claim") {
      rows.find((r) => r.ID === t.player).ABBR = t.team; // keeps RESERVE, like a trade
      owners.set(t.player, t.team);
    } else {
      rows.splice(rows.findIndex((r) => r.ID === t.player), 1);
      owners.delete(t.player);
    }
    t.appliedAt = previouslyAppliedAt ?? now;
    applied.push(t.id);
  }
  return { applied, skipped };
}
