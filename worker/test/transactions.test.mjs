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
const add = (...transactions) => post("/transactions/add", { ...base, transactions });
const waive = (team, player) => ({ type: "waive", team, player });
const sign = (team, player, salary = 3) => ({ type: "sign", team, player, salary });
const claim = (team, from, player) => ({ type: "claim", team, from, player });

test("only the commissioner can record transactions", async () => {
  assert.equal((await post("/transactions/add", { ...base, password: "nope", transactions: [waive("ANA", "ana01")] })).status, 401);
  env.ADMIN_PASSWORD = undefined;
  assert.equal((await add(waive("ANA", "ana01"))).status, 403);
  assert.equal(dispatches.length, 0);
});

test("a whole batch goes out as ONE dispatch for the next period, in order, with a C-YY contract", async () => {
  const r = await add(waive("ANA", "ana01"), sign("BOS", "fa01"), claim("BOS", "ANA", "ana02"));
  assert.equal(r.status, 200);
  assert.deepEqual([r.body.period, r.body.count], [8, 3]);
  assert.equal(dispatches.length, 1);
  assert.equal(dispatches[0].event_type, "transaction");
  const { period, add: sent } = dispatches[0].client_payload;
  assert.equal(period, 8);
  assert.deepEqual(sent.map((t) => [t.type, t.team, t.player, t.salary, t.contract, t.from]), [
    ["waive", "ANA", "ana01", undefined, undefined, undefined],
    ["sign", "BOS", "fa01", 3, "C-27", undefined],
    ["claim", "BOS", "ana02", undefined, undefined, "ANA"],
  ]);
  assert.ok(sent[0].at < sent[1].at && sent[1].at < sent[2].at);
  assert.ok(sent.every((t) => /^[0-9a-f-]{36}$/.test(t.id)));
});

test("one bad line rejects the whole batch and names the line", async () => {
  const bad = async (txs, re) => {
    const r = await add(...txs);
    assert.equal(r.status, 400, JSON.stringify(txs));
    if (re) assert.match(r.body.error, re);
  };
  await bad([waive("ANA", "ana01"), waive("BOS", "ana02")], /Line 2.*not BOS/); // wrong team
  await bad([waive("ANA", "ana01"), waive("ANA", "ana01")], /Line 2.*not on any roster/); // cut twice
  await bad([sign("BOS", "ana01")], /already on ANA/);
  await bad([sign("BOS", "nobody")], /not in player_info/);
  await bad([sign("BOS", "fa01", -1)], /Line 1.*salary/);
  await bad([sign("BOS", "fa01", 1.5)], /salary/);
  await bad([sign("XXX", "fa01")], /unknown team/);
  await bad([claim("BOS", "BOS", "bos01")], /from team/);
  await bad([claim("BOS", "ANA", "bos01")], /not ANA/);
  await bad([{ type: "trade", team: "ANA", player: "ana01" }], /Line 1/);
  await bad([]);
  assert.equal(dispatches.length, 0);
});

test("lines see the ones before them; transactions already recorded count too", async () => {
  // cut then sign the same player elsewhere is fine inside one batch; signing him twice is not
  assert.equal((await add(waive("ANA", "ana01"), sign("BOS", "ana01"))).status, 200);
  assert.equal((await add(sign("BOS", "fa01"), sign("ANA", "fa01"))).status, 400);
  files["src/data/static/2026-27/transactions/transactions_p08.json"] = JSON.stringify({ transactions: [
    { id: "00000000-0000-0000-0000-000000000001", type: "claim", team: "BOS", from: "ANA", player: "ana01", at: "2026-11-19T10:00:00Z" },
  ] });
  assert.equal((await add(waive("BOS", "ana01"))).status, 200); // BOS owns him now
  assert.equal((await add(waive("ANA", "ana01"))).status, 400);
});

test("remove dispatches the ids", async () => {
  const id = "00000000-0000-0000-0000-000000000001";
  assert.equal((await post("/transactions/remove", { ...base, ids: ["bad"] })).status, 400);
  assert.equal((await post("/transactions/remove", { ...base, ids: [] })).status, 400);
  assert.equal((await post("/transactions/remove", { ...base, ids: [id] })).status, 200);
  assert.deepEqual(dispatches[0].client_payload, { season: "2026-27", period: 8, remove: [id] });
});
