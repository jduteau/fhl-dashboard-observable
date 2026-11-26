// Run with: node --test worker/test/players.test.mjs
// The commissioner's add-player endpoint against a fake GitHub and a fake NHL API.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import worker from "../index.js";

const schema = readFileSync(new URL("../schema.sql", import.meta.url), "utf-8");
const ORIGIN = "https://pages.example";

// NHL fixtures: search results, and the landing page of each player id
const NHL = {
  search: {
    "Eric Dupont-Smith": [{ playerId: "1", name: "Éric Dupont-Smith" }, { playerId: "9", name: "Eric Dupont-Smithson" }],
    "Sam Twin": [{ playerId: "2", name: "Sam Twin" }, { playerId: "3", name: "Sam Twin" }],
    "Vic Vegas": [{ playerId: "4", name: "Vic Vegas" }],
    "Luke Haymes": [{ playerId: "5", name: "Luke Haymes" }],
    "Pat Nobody": [],
  },
  landing: {
    1: { firstName: { default: "Éric" }, lastName: { default: "Dupont-Smith" }, birthDate: "2005-03-09", position: "L", currentTeamAbbrev: "TOR" },
    2: { firstName: { default: "Sam" }, lastName: { default: "Twin" }, birthDate: "2001-01-01", position: "C", currentTeamAbbrev: "TOR" },
    3: { firstName: { default: "Sam" }, lastName: { default: "Twin" }, birthDate: "2002-02-02", position: "G" },
    4: { firstName: { default: "Vic" }, lastName: { default: "Vegas" }, birthDate: "2000-04-04", position: "R", currentTeamAbbrev: "VGK" },
    5: { firstName: { default: "Luke" }, lastName: { default: "Haymes" }, birthDate: "2003-07-28", position: "C", currentTeamAbbrev: "TOR" },
  },
};

let files, dispatches, env;
beforeEach(() => {
  files = {
    "src/data/static/seasons.csv": "season,label,current\n2026-27,2026-27,true\n",
    "src/data/static/2026-27/player_info.csv": "ID,Name,BirthDate,Pos,NHL,HockeyDB,PuckPedia\nhaymelu01,Luke Haymes,2003-07-28,F,TOR,248919,luke-haymes\nx01,Some Vegas Guy,1999-01-01,D,VEG,1,x\nx02,Some Free Agent,1999-01-01,D,---,1,x\n",
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
    const u = new URL(url);
    if (u.host === "search.d3.nhle.com") return Response.json(Object.entries(NHL.search).find(([q]) => q.toLowerCase() === u.searchParams.get("q").toLowerCase())?.[1] ?? []);
    if (u.host === "api-web.nhle.com") return Response.json(NHL.landing[u.pathname.split("/")[3]]);
    const path = u.pathname.replace("/repos/test/repo/", "");
    if (path === "dispatches") { dispatches.push(JSON.parse(init.body)); return new Response(null, { status: 204 }); }
    const file = path.replace(/^contents\//, "");
    return file in files ? new Response(files[file]) : new Response("not found", { status: 404 });
  };
});

const post = async (body) => {
  const res = await worker.fetch(new Request("https://worker.example/players/add", { method: "POST", headers: { origin: ORIGIN }, body: JSON.stringify(body) }), env);
  return { status: res.status, body: await res.json() };
};
const base = { password: "boss", season: "2026-27" };

test("a name is looked up on the NHL API and goes out as one dispatch", async () => {
  const r = await post({ ...base, name: "eric dupont-smith" }); // accents and case do not matter; the lookalike (Dupont-Smithson) is ignored
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { ok: true, name: "Éric Dupont-Smith", birthDate: "2005-03-09", pos: "LW", nhl: "TOR" });
  assert.equal(dispatches.length, 1);
  assert.equal(dispatches[0].event_type, "add-player");
  assert.deepEqual(dispatches[0].client_payload, {
    season: "2026-27",
    player: { Name: "Éric Dupont-Smith", BirthDate: "2005-03-09", Pos: "LW", NHL: "TOR", HockeyDB: "", PuckPedia: "eric-dupont-smith", first: "Éric", last: "Dupont-Smith" },
  });
});

test("only the commissioner can add a player", async () => {
  assert.equal((await post({ ...base, password: "nope", name: "Eric Dupont-Smith" })).status, 401);
  assert.equal(dispatches.length, 0);
});

test("a player with no team gets ---, and the NHL's VGK is the data's VEG", async () => {
  assert.equal((await post({ ...base, name: "Vic Vegas" })).body.nhl, "VEG");
  const twin = await post({ ...base, name: "Sam Twin", birthDate: "2002-02-02" });
  assert.deepEqual([twin.body.pos, twin.body.nhl], ["G", "---"]);
});

test("unknown names, ambiguous names and duplicates are refused without a dispatch", async () => {
  assert.match((await post({ ...base, name: "Pat Nobody" })).body.error, /no player named/);
  const twins = await post({ ...base, name: "Sam Twin" });
  assert.equal(twins.status, 400);
  assert.match(twins.body.error, /2001-01-01.*2002-02-02/);
  assert.match((await post({ ...base, name: "Sam Twin", birthDate: "1999-09-09" })).body.error, /was born on 1999-09-09/);
  assert.equal((await post({ ...base, name: "Luke Haymes" })).status, 409);
  assert.equal((await post({ ...base, name: "Madonna" })).status, 400);
  assert.equal((await post({ ...base, name: "Sam Twin", birthDate: "soon" })).status, 400);
  assert.equal((await post({ ...base, season: "2025-26", name: "Vic Vegas" })).status, 409);
  assert.equal(dispatches.length, 0);
});
