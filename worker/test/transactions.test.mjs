// Run with: node --test worker/test/transactions.test.mjs
// The commissioner's free-agent / waiver endpoints against a fake GitHub serving a tiny fixture league.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import worker from "../index.js";

const ORIGIN = "https://pages.example";
const schema = readFileSync(new URL("../schema.sql", import.meta.url), "utf-8");
const roster = (teams) => "ID,ABBR,RESERVE\n" + Object.entries(teams).flatMap(([t, ids]) => ids.map((id) => `${id},${t},`)).join("\n") + "\n";

let files, dispatches, env;
beforeEach(() => {
  files = {
    "src/data/static/seasons.csv": "season,label,current\n2026-27,2026-27,true\n",
    "src/data/static/2026-27/owners.csv": "ABBR,OWNER\nANA,A\nBOS,B\n",
    "src/data/static/2026-27/rosters/rosters_p07.csv": roster({ ANA: ["ana01", "ana02"], BOS: ["bos01"] }),
    "src/data/static/2026-27/player_info.csv": "ID,Name,Pos\nana01,A One,F\nana02,A Two,D\nbos01,B One,F\nfa01,Free Agent,F\n",
    "src/data/static/2026-27/draft_picks.csv": "PICK,OWNER\nANA1,ANA\n",
  };
  dispatches = [];
  const db = new DatabaseSync(":memory:");
  db.exec(schema);
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    run: async () => ({ meta: { changes: Number(db.prepare(sql).run(...args).changes) } }),
    all: async () => ({ results: db.prepare(sql).all(...args).map((r) => ({ ...r })) }),
    first: async () => { const r = db.prepare(sql).get(...args); return r ? { ...r } : null; },
  });
  const d1 = {
    prepare: (sql) => stmt(sql),
    batch: async (stmts) => { db.exec("BEGIN"); try { const out = []; for (const x of stmts) out.push(await x.run()); db.exec("COMMIT"); return out; } catch (e) { db.exec("ROLLBACK"); throw e; } },
  };
  env = { DB: d1, GITHUB_REPO: "test/repo", GITHUB_TOKEN: "t", ALLOWED_ORIGIN: ORIGIN, ADMIN_PASSWORD: "boss" };
  globalThis.fetch = async (url, init = {}) => {
    const path = new URL(url).pathname.replace("/repos/test/repo/", "");
    if (path === "dispatches") { dispatches.push(JSON.parse(init.body)); return new Response(null, { status: 204 }); }
    const file = path.replace(/^contents\//, "");
    if (file in files) return new Response(files[file]);
    const children = Object.keys(files).filter((f) => f.startsWith(file + "/"));
    if (children.length) return Response.json(children.map((f) => ({ name: f.split("/").pop() })));
    return new Response("not found", { status: 404 });
  };
});

const post = async (path, body) => {
  const res = await worker.fetch(new Request(`https://worker.example${path}`, { method: "POST", headers: { origin: ORIGIN }, body: JSON.stringify(body) }), env);
  return { status: res.status, body: await res.json() };
};
const base = { password: "boss", season: "2026-27" };
const add = (extra) => post("/transactions/add", { ...base, ...extra });

test("only the commissioner can record transactions", async () => {
  assert.equal((await add({ password: "nope", type: "waive", team: "ANA", player: "ana01" })).status, 401);
  env.ADMIN_PASSWORD = undefined;
  assert.equal((await add({ type: "waive", team: "ANA", player: "ana01" })).status, 403);
  assert.equal(dispatches.length, 0);
});

test("a waiver cut and a signing are dispatched for the next period", async () => {
  const cut = await add({ type: "waive", team: "ANA", player: "ana01" });
  assert.equal(cut.status, 200);
  assert.equal(cut.body.period, 8);
  const sign = await add({ type: "sign", team: "BOS", player: "fa01", salary: 3, contract: "C-27" });
  assert.equal(sign.status, 200);
  assert.deepEqual(dispatches.map((d) => d.event_type), ["transaction", "transaction"]);
  const t = dispatches[1].client_payload.transaction;
  assert.equal(dispatches[1].client_payload.period, 8);
  assert.deepEqual([t.type, t.team, t.player, t.salary, t.contract], ["sign", "BOS", "fa01", 3, "C-27"]);
  assert.match(t.id, /^[0-9a-f-]{36}$/);
});

test("requests that don't make sense are refused", async () => {
  const bad = async (extra) => assert.equal((await add(extra)).status, 400, JSON.stringify(extra));
  await bad({ type: "waive", team: "BOS", player: "ana01" }); // wrong team
  await bad({ type: "sign", team: "BOS", player: "ana01", salary: 1, contract: "C-27" }); // already rostered
  await bad({ type: "sign", team: "BOS", player: "nobody", salary: 1, contract: "C-27" }); // not in player_info
  await bad({ type: "sign", team: "BOS", player: "fa01", salary: -1, contract: "C-27" });
  await bad({ type: "sign", team: "BOS", player: "fa01", salary: 1 }); // no contract
  await bad({ type: "sign", team: "XXX", player: "fa01", salary: 1, contract: "C-27" });
  await bad({ type: "trade", team: "ANA", player: "ana01" });
  assert.equal(dispatches.length, 0);
});

test("transactions already recorded count: a waived player can be claimed, a signed one can't be signed again", async () => {
  files["src/data/static/2026-27/transactions/transactions_p08.json"] = JSON.stringify({ transactions: [
    { id: "00000000-0000-0000-0000-000000000001", type: "waive", team: "ANA", player: "ana01", at: "2026-11-19T10:00:00Z" },
    { id: "00000000-0000-0000-0000-000000000002", type: "sign", team: "BOS", player: "fa01", salary: 1, contract: "C-27", at: "2026-11-19T10:00:01Z" },
  ] });
  assert.equal((await add({ type: "sign", team: "BOS", player: "ana01", salary: 2, contract: "C-27" })).status, 200);
  assert.equal((await add({ type: "sign", team: "ANA", player: "fa01", salary: 2, contract: "C-27" })).status, 400);
  assert.equal((await add({ type: "waive", team: "ANA", player: "ana01" })).status, 400); // already cut
});

test("remove dispatches the id", async () => {
  const id = "00000000-0000-0000-0000-000000000001";
  assert.equal((await post("/transactions/remove", { ...base, id: "bad" })).status, 400);
  assert.equal((await post("/transactions/remove", { ...base, id })).status, 200);
  assert.deepEqual(dispatches[0].client_payload, { season: "2026-27", period: 8, action: "remove", id });
});
