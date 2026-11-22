// Free-agent signings, waiver cuts and waiver claims, recorded by the commissioner (ADMIN_PASSWORD) as they happen during
// a period, in batches (a waiver run can be dozens).
//
//   POST /transactions/add     {password, season, transactions: [{type: "sign"|"waive"|"claim", team, player, salary?, from?}]}
//   POST /transactions/remove  {password, season, ids: [id]}
//
// type "sign": `team` signs a free agent for `salary` (always a C-YY contract: C-27 in 2026-27, so none is sent).
// type "waive": `team` cuts `player`.   type "claim": `team` claims `player` off waivers from team `from`.
// Both endpoints send ONE `transaction` repository_dispatch (Record Transactions workflow) per call, which stores the batch in
// src/data/static/<season>/transactions/transactions_pNN.json for the NEXT period; materializing that period applies them.
// The Worker checks the whole batch against the repo first (in order, each seeing the ones before it) so the commissioner
// gets an immediate answer naming the first problem line; nothing is sent unless every line is fine. The workflow checks
// again, because that is the one that writes.
import { csvParse, ghFile, gh, HttpError } from "./lib.js";
import { assertAdmin } from "./accounts.js";
import { loadContext, loadOwnership } from "./trades.js";
import { SEASON } from "../src/components/tradeRules.js";
import { cleanTransaction, applyTransactions, TRANSACTION_ID } from "../src/components/transactionRules.js";

const MAX_BATCH = 100;
const bad = (message) => new HttpError(400, message);

export async function handleTransactions(action, body, env, client) {
  if (action !== "add" && action !== "remove") throw new HttpError(404, "Unknown transactions endpoint");
  if (!SEASON.test(body.season ?? "") || typeof body.password !== "string") throw bad("Invalid request");
  await assertAdmin(env, body.password, client);
  const ctx = await loadContext(env, body.season);

  let payload;
  if (action === "add") {
    const items = body.transactions;
    if (!Array.isArray(items) || !items.length || items.length > MAX_BATCH) throw bad(`Send between 1 and ${MAX_BATCH} transactions`);
    const start = Date.now();
    const cleaned = items.map((raw, i) => {
      try {
        // `at` orders the batch: one millisecond apart, in the order entered
        return cleanTransaction({ id: crypto.randomUUID(), at: new Date(start + i).toISOString(), type: raw?.type, team: raw?.team, player: raw?.player, from: raw?.from, salary: raw?.salary, contract: `C-${ctx.season.slice(5)}` });
      } catch (e) { throw bad(`Line ${i + 1}: ${e.message.replace(/ in transaction [0-9a-f-]+/, "").replace(/^Invalid /, "bad ")}`); }
    });
    const [own, info, owners] = await Promise.all([
      loadOwnership(env, ctx),
      ghFile(env, `src/data/static/${ctx.season}/player_info.csv`),
      ghFile(env, `src/data/static/${ctx.season}/owners.csv`),
    ]);
    const teams = new Set(csvParse(owners ?? "").map((o) => o.ABBR));
    const players = new Set(csvParse(info ?? "").map((p) => p.ID));
    // Play the batch forward in order, on top of what is already recorded
    const rows = [...own.playerOwner].map(([ID, ABBR]) => ({ ID, ABBR, RESERVE: "" }));
    cleaned.forEach((t, i) => {
      const line = `Line ${i + 1}`;
      if (!teams.has(t.team) || (t.from && !teams.has(t.from))) throw bad(`${line}: unknown team`);
      if (!players.has(t.player)) throw bad(`${line}: ${t.player} is not in player_info.csv yet`);
      const problem = applyTransactions(rows, [{ ...t }]).skipped[0]?.reason;
      if (problem) throw bad(`${line}: ${problem}`);
    });
    payload = { season: ctx.season, period: ctx.period, add: cleaned };
  } else {
    if (!Array.isArray(body.ids) || !body.ids.length || body.ids.length > MAX_BATCH || !body.ids.every((id) => typeof id === "string" && TRANSACTION_ID.test(id)))
      throw bad("Invalid transaction ids");
    payload = { season: ctx.season, period: ctx.period, remove: body.ids };
  }

  const dispatch = await gh(env, "dispatches", { method: "POST", body: JSON.stringify({ event_type: "transaction", client_payload: payload }) });
  if (dispatch.status !== 204) throw new HttpError(502, "Could not record the transactions");
  return { ok: true, period: ctx.period, count: (payload.add ?? payload.remove).length };
}
