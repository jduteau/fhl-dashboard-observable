// Free-agent signings and waiver cuts, recorded by the commissioner (ADMIN_PASSWORD) as they happen during a period.
//
//   POST /transactions/add     {password, season, type: "sign"|"waive", team, player, salary?}
//   (an in-season signing is always on a C-YY contract: C-27 in 2026-27, so the contract is not sent)
//   POST /transactions/remove  {password, season, id}
//
// Both send a `transaction` repository_dispatch (Record Transactions workflow), which stores them in
// src/data/static/<season>/transactions/transactions_pNN.json for the NEXT period; materializing that period applies them.
// The Worker checks the request against the repo first so the commissioner gets an immediate answer; the workflow
// checks again, because that is the one that writes.
import { csvParse, ghFile, gh, HttpError } from "./lib.js";
import { assertAdmin } from "./accounts.js";
import { loadContext, loadOwnership } from "./trades.js";
import { SEASON } from "../src/components/tradeRules.js";
import { cleanTransaction, transactionProblem, TRANSACTION_ID } from "../src/components/transactionRules.js";

const bad = (message) => new HttpError(400, message);

export async function handleTransactions(action, body, env, client) {
  if (action !== "add" && action !== "remove") throw new HttpError(404, "Unknown transactions endpoint");
  if (!SEASON.test(body.season ?? "") || typeof body.password !== "string") throw bad("Invalid request");
  await assertAdmin(env, body.password, client);
  const ctx = await loadContext(env, body.season);

  let payload;
  if (action === "add") {
    let t;
    try {
      t = cleanTransaction({ id: crypto.randomUUID(), at: new Date().toISOString(), type: body.type, team: body.team, player: body.player, salary: body.salary, contract: `C-${ctx.season.slice(5)}` });
    } catch (e) { throw bad(`Invalid transaction: ${e.message.replace(/ in transaction [0-9a-f-]+/, "").replace(/^Invalid /, "bad ")}`); }
    const [own, info, owners] = await Promise.all([
      loadOwnership(env, ctx),
      ghFile(env, `src/data/static/${ctx.season}/player_info.csv`),
      ghFile(env, `src/data/static/${ctx.season}/owners.csv`),
    ]);
    if (!csvParse(owners ?? "").some((o) => o.ABBR === t.team)) throw bad("Unknown team");
    if (!csvParse(info ?? "").some((p) => p.ID === t.player)) throw bad(`${t.player} is not in player_info.csv yet`);
    const problem = transactionProblem(t, { playerOwner: (id) => own.playerOwner.get(id) });
    if (problem) throw bad(problem);
    payload = { season: ctx.season, period: ctx.period, action, transaction: t };
  } else {
    if (!TRANSACTION_ID.test(body.id ?? "")) throw bad("Invalid transaction id");
    payload = { season: ctx.season, period: ctx.period, action, id: body.id };
  }

  const dispatch = await gh(env, "dispatches", { method: "POST", body: JSON.stringify({ event_type: "transaction", client_payload: payload }) });
  if (dispatch.status !== 204) throw new HttpError(502, "Could not record the transaction");
  return { ok: true, period: ctx.period, ...(payload.transaction ? { id: payload.transaction.id } : {}) };
}
