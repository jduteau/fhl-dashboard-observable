// Run with: node --test worker/test/
// Exercises the real Worker against an in-memory SQLite database (node:sqlite, wrapped to look like D1)
// and a fake GitHub serving a tiny fixture league.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import worker from "../index.js";

const ORIGIN = "https://pages.example";
const schema = readFileSync(new URL("../schema.sql", import.meta.url), "utf-8");

function d1(db) {
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    run: async () => ({ meta: { changes: Number(db.prepare(sql).run(...args).changes) } }),
    all: async () => ({ results: db.prepare(sql).all(...args).map((r) => ({ ...r })) }),
    first: async () => { const r = db.prepare(sql).get(...args); return r ? { ...r } : null; },
  });
  return {
    prepare: (sql) => stmt(sql),
    batch: async (stmts) => {
      db.exec("BEGIN");
      try { const out = []; for (const s of stmts) out.push(await s.run()); db.exec("COMMIT"); return out; }
      catch (e) { db.exec("ROLLBACK"); throw e; }
    },
  };
}

const players = (team, n) => Array.from({ length: n }, (_, i) => `${team.toLowerCase()}${String(i + 1).padStart(2, "0")}`);
const rosterCsv = (teams) => "ID,ABBR,RESERVE\n" + Object.entries(teams).flatMap(([t, n]) => players(t, n).map((id) => `${id},${t},`)).join("\n") + "\n";

let files, dispatches, env, emails, emailStatus;
const baseFiles = () => ({
  "src/data/static/seasons.csv": "season,label,current\n2026-27,2026-27,true\n2027-28,2027-28,false\n",
  "src/data/static/2026-27/owners.csv": "﻿ABBR,OWNER,EMAIL,PW\nANA,A,a@x.com,pwA\nBOS,B,b@x.com,pwB\nCAR,C,c@x.com,pwC\n",
  "src/data/static/2026-27/rosters/rosters_p07.csv": rosterCsv({ ANA: 21, BOS: 20, CAR: 20 }),
  "src/data/static/2026-27/draft_picks.csv": "PICK,OWNER\nANA1,ANA\nBOS1,BOS\nCAR1,CAR\nWPG2,ANA\n",
  "src/data/static/2027-28/draft_picks.csv": "PICK,OWNER\nANA1,ANA\nBOS1,BOS\n",
  "src/data/static/2026-27/player_info.csv": "ID,Name,Pos\nana01,Anna One,F\nana02,Anna Two,D\nbos01,Bo Sone,F\ncar01,Cara One,G\n",
});

beforeEach(() => {
  files = baseFiles();
  dispatches = [];
  emails = [];
  emailStatus = 200;
  const db = new DatabaseSync(":memory:");
  db.exec(schema);
  env = { DB: d1(db), GITHUB_REPO: "test/repo", GITHUB_TOKEN: "t", ALLOWED_ORIGIN: ORIGIN };
  globalThis.fetch = async (url, init = {}) => {
    const path = new URL(url).pathname.replace("/repos/test/repo/", "");
    if (String(url).startsWith("https://api.emailjs.com/")) { emails.push(JSON.parse(init.body)); return new Response("OK", { status: emailStatus }); }
    if (path === "dispatches") { dispatches.push(JSON.parse(init.body)); return new Response(null, { status: 204 }); }
    const file = path.replace(/^contents\//, "");
    if (file in files) return new Response(files[file]);
    const children = Object.keys(files).filter((f) => f.startsWith(file + "/"));
    if (children.length) return Response.json(children.map((f) => ({ name: f.split("/").pop() })));
    return new Response("not found", { status: 404 });
  };
});

const post = async (path, body, origin = ORIGIN, execCtx) => {
  const res = await worker.fetch(new Request(`https://worker.example${path}`, { method: "POST", headers: { origin }, body: JSON.stringify(body) }), env, execCtx);
  return { status: res.status, body: await res.json() };
};
const as = (team, pw) => ({ season: "2026-27", team, password: pw });
const A = as("ANA", "pwA"), B = as("BOS", "pwB"), C = as("CAR", "pwC");
const propose = (who, extra) => post("/trades/propose", { ...who, ...extra });
const list = (who) => post("/trades/list", who);
const respond = (who, id, decision) => post("/trades/respond", { ...who, id, decision });
const tick = () => new Promise((r) => setTimeout(r, 3)); // dependent steps never share a millisecond in real life
const ok = (r) => { assert.equal(r.status, 200, JSON.stringify(r.body)); return r.body; };
const oneForOne = { to: "BOS", give: { players: ["ana01"] }, get: { players: ["bos01"] } };

test("auth: wrong password and bad origin are rejected", async () => {
  assert.equal((await propose(as("ANA", "nope"), oneForOne)).status, 401);
  assert.equal((await post("/trades/list", A, "https://evil.example")).status, 403);
});

test("CORS: every configured origin is echoed back; unknown origins are refused", async () => {
  env.ALLOWED_ORIGIN = `${ORIGIN}, http://localhost:3000`;
  const call = (origin) => worker.fetch(new Request("https://worker.example/trades/list", { method: "POST", headers: { origin }, body: JSON.stringify(A) }), env);
  for (const o of [ORIGIN, "http://localhost:3000"]) {
    const r = await call(o);
    assert.equal(r.status, 200);
    assert.equal(r.headers.get("access-control-allow-origin"), o);
  }
  const bad = await call("https://evil.example");
  assert.equal(bad.status, 403);
  assert.equal(bad.headers.get("access-control-allow-origin"), ORIGIN);
  const preflight = await worker.fetch(new Request("https://worker.example/trades/list", { method: "OPTIONS", headers: { origin: "http://localhost:3000" } }), env);
  assert.equal(preflight.headers.get("access-control-allow-origin"), "http://localhost:3000");
});

test("existing roster-moves endpoint still works at the root path", async () => {
  const r = await post("/", { ...A, period: 8, promote: [], demote: [] });
  assert.equal(r.status, 202);
  assert.equal(dispatches[0].event_type, "roster-moves");
  assert.equal((await post("/", { ...as("ANA", "bad"), period: 8, promote: [], demote: [] })).status, 401);
});

test("propose is visible to both GMs but never to a third team", async () => {
  const { id, period } = ok(await propose(A, { ...oneForOne, note: "hi" }));
  assert.equal(period, 8);
  for (const who of [A, B]) {
    const l = ok(await list(who));
    assert.equal(l.trades.length, 1);
    assert.deepEqual(l.trades[0].give.players, ["ana01"]);
    assert.deepEqual(l.trades[0].get.players, ["bos01"]);
    assert.equal(l.trades[0].status, "PROPOSED");
  }
  assert.equal(ok(await list(C)).trades.length, 0);
  assert.equal((await respond(C, id, "accept")).status, 404); // looks like it doesn't exist
});

test("draft picks can be traded, including next season's", async () => {
  const r = ok(await propose(A, { to: "BOS", give: { picks: [{ pick: "ANA1", season: "2027-28" }, { pick: "WPG2", season: "2026-27" }] }, get: { picks: [{ pick: "BOS1", season: "2026-27" }] } }));
  const t = ok(await list(B)).trades[0];
  assert.equal(t.id, r.id);
  assert.deepEqual(t.give.picks, [{ pick: "WPG2", season: "2026-27" }, { pick: "ANA1", season: "2027-28" }]);
});

test("ownership is enforced", async () => {
  assert.equal((await propose(A, { to: "BOS", give: { players: ["bos01"] }, get: {} })).status, 400); // not mine
  assert.equal((await propose(A, { to: "BOS", give: {}, get: { players: ["ana01"] } })).status, 400); // already mine
  assert.equal((await propose(A, { to: "BOS", give: { picks: [{ pick: "BOS1", season: "2026-27" }] }, get: {} })).status, 400);
  assert.equal((await propose(A, { to: "BOS", give: { picks: [{ pick: "ANA9", season: "2026-27" }] }, get: {} })).status, 400);
  assert.equal((await propose(A, { to: "ANA", give: { players: ["ana01"] }, get: {} })).status, 400); // self
  assert.equal((await propose(A, { to: "XXX", give: { players: ["ana01"] }, get: {} })).status, 400);
  assert.equal((await propose(A, { to: "BOS", give: {}, get: {} })).status, 400); // empty
});

test("rosters must stay between 20 and 36 players", async () => {
  // BOS has 20: giving one away for nothing would leave 19
  const r = await propose(A, { to: "BOS", give: {}, get: { players: ["bos01"] } });
  assert.equal(r.status, 400);
  assert.match(r.body.error, /BOS would have 19/);
  // ANA has 21: sending away 2 for nothing leaves 19; 1 for nothing leaves 20 (ok)
  assert.equal((await propose(A, { to: "BOS", give: { players: ["ana01", "ana02"] }, get: {} })).status, 400);
  ok(await propose(A, { to: "BOS", give: { players: ["ana01"] }, get: {} }));
});

test("only the other GM can accept; accepting dispatches the trade to GitHub", async () => {
  const { id } = ok(await propose(A, { ...oneForOne, note: "private chatter" }));
  assert.equal((await respond(A, id, "accept")).status, 403); // proposer can't approve their own
  const r = ok(await respond(B, id, "accept"));
  assert.equal(r.status, "ACCEPTED");
  assert.equal(r.published, true);
  assert.equal(dispatches.length, 1);
  const payload = dispatches[0].client_payload;
  assert.equal(dispatches[0].event_type, "trade-approved");
  assert.deepEqual([payload.season, payload.period], ["2026-27", 8]);
  assert.equal(payload.trades.length, 1);
  assert.deepEqual(payload.trades[0].give.players, ["ana01"]);
  assert.deepEqual(payload.trades[0].get.players, ["bos01"]);
  assert.equal(payload.trades[0].from, "ANA");
  assert.ok(payload.trades[0].acceptedAt);
  assert.ok(!JSON.stringify(payload).includes("private chatter")); // notes are private; the trade log is public
  assert.equal(ok(await list(A)).trades[0].status, "ACCEPTED");
  assert.equal((await respond(B, id, "accept")).status, 409); // not twice
  assert.equal(dispatches.length, 1);
});

test("every dispatch carries ALL accepted trades for the period, so a dropped workflow run loses nothing", async () => {
  const t1 = ok(await propose(A, oneForOne)).id;
  const t2 = ok(await propose(A, { to: "CAR", give: { players: ["ana05"] }, get: { players: ["car05"] } })).id;
  const t3 = ok(await propose(A, { to: "CAR", give: { players: ["ana07"] }, get: {} })).id; // never accepted
  ok(await respond(B, t1, "accept"));
  ok(await respond(C, t2, "accept"));
  assert.deepEqual(dispatches[0].client_payload.trades.map((t) => t.id), [t1]);
  assert.deepEqual(dispatches[1].client_payload.trades.map((t) => t.id).sort(), [t1, t2].sort());
  assert.ok(!dispatches[1].client_payload.trades.some((t) => t.id === t3));
});

test("republish re-sends accepted trades (any authenticated GM), and is a no-op when there are none", async () => {
  assert.deepEqual(ok(await post("/trades/republish", C)), { ok: true, count: 0 });
  assert.equal(dispatches.length, 0);
  const { id } = ok(await propose(A, oneForOne));
  ok(await respond(B, id, "accept"));
  assert.deepEqual(ok(await post("/trades/republish", C)), { ok: true, count: 1 });
  assert.equal(dispatches.length, 2);
  assert.equal(dispatches[1].client_payload.trades[0].id, id);
  assert.equal((await post("/trades/republish", as("CAR", "wrong"))).status, 401);
});

test("an accept whose dispatch fails stays accepted and can be re-sent", async () => {
  const { id } = ok(await propose(A, oneForOne));
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => (String(url).endsWith("/dispatches") ? new Response("nope", { status: 500 }) : realFetch(url, init));
  const r = ok(await respond(B, id, "accept"));
  assert.equal(r.status, "ACCEPTED");
  assert.equal(r.published, false);
  assert.equal((await post("/trades/republish", B)).status, 502);
  globalThis.fetch = realFetch;
  assert.deepEqual(ok(await post("/trades/republish", B)), { ok: true, count: 1 });
});

test("decline and withdraw", async () => {
  const t1 = ok(await propose(A, oneForOne)).id;
  assert.equal((await respond(B, t1, "withdraw")).status, 403);
  assert.equal(ok(await respond(A, t1, "withdraw")).status, "WITHDRAWN");
  const t2 = ok(await propose(A, oneForOne)).id;
  assert.equal((await respond(A, t2, "decline")).status, 403);
  assert.equal(ok(await respond(B, t2, "decline")).status, "DECLINED");
});

test("accepting a trade voids other open proposals in which the same team gives the same assets", async () => {
  const t1 = ok(await propose(A, oneForOne)).id;
  const t2 = ok(await propose(C, { to: "ANA", give: { players: ["car01"] }, get: { players: ["ana01"] } })).id; // also wants ana01
  const t3 = ok(await propose(A, { to: "CAR", give: { players: ["ana05"] }, get: { players: ["car05"] } })).id; // unrelated
  ok(await respond(B, t1, "accept"));
  const byId = Object.fromEntries(ok(await list(A)).trades.map((t) => [t.id, t.status]));
  assert.deepEqual(byId, { [t1]: "ACCEPTED", [t2]: "VOID", [t3]: "PROPOSED" });
  assert.equal((await respond(A, t2, "accept")).status, 409);
  // ANA already gave ana01 away, so nobody can get it from ANA any more
  const again = await propose(C, { to: "ANA", give: {}, get: { players: ["ana01"] } });
  assert.equal(again.status, 400);
  assert.match(again.body.error, /ana01 is not on ANA's roster/);
});

test("assets acquired in an accepted trade can be traded onward; assets given away can't be offered again", async () => {
  // T1: ANA sends ana01 + pick WPG2 to BOS for bos01
  const t1 = ok(await propose(A, { to: "BOS", give: { players: ["ana01"], picks: [{ pick: "WPG2", season: "2026-27" }] }, get: { players: ["bos01"] } })).id;
  ok(await respond(B, t1, "accept"));
  await tick();

  // ANA no longer owns what it gave away
  assert.match((await propose(A, { to: "CAR", give: { players: ["ana01"] }, get: { players: ["car01"] } })).body.error, /ana01 is not on ANA/);
  assert.match((await propose(A, { to: "CAR", give: { picks: [{ pick: "WPG2", season: "2026-27" }] }, get: {} })).body.error, /ANA does not own WPG2/);
  // BOS no longer owns bos01...
  assert.match((await propose(B, { to: "CAR", give: { players: ["bos01"] }, get: { players: ["car01"] } })).body.error, /bos01 is not on BOS/);
  // ...but BOS now owns ana01 and WPG2, and can trade them on. Roster sizes count T1: BOS is back at 20, so 1-for-0 would leave 19.
  assert.match((await propose(B, { to: "CAR", give: { players: ["ana01"] }, get: {} })).body.error, /BOS would have 19/);
  const t2 = ok(await propose(B, { to: "CAR", give: { players: ["ana01"], picks: [{ pick: "WPG2", season: "2026-27" }] }, get: { players: ["car01"] } })).id;
  // ANA can now trade the player it received
  const t3 = ok(await propose(A, { to: "CAR", give: { players: ["bos01"] }, get: { players: ["car02"] } })).id;

  ok(await respond(C, t2, "accept"));
  await tick();
  ok(await respond(C, t3, "accept"));
  const byId = Object.fromEntries(ok(await list(A)).trades.map((t) => [t.id, t.status]));
  assert.deepEqual(byId, { [t1]: "ACCEPTED", [t3]: "ACCEPTED" }); // T1 is untouched by the onward trade
  // the dispatch lists them oldest first, so the Record Trades / materialize steps replay the chain in order
  assert.deepEqual(dispatches.at(-1).client_payload.trades.map((t) => t.id), [t1, t2, t3]);
  // CAR now owns ana01, WPG2 and bos01; BOS is out of them again
  assert.match((await propose(B, { to: "CAR", give: { players: ["ana01"] }, get: {} })).body.error, /ana01 is not on BOS/);
  ok(await propose(C, { to: "ANA", give: { players: ["ana01"] }, get: { players: ["ana02"] } })); // CAR can pass it on (1-for-1 keeps it at 20)
});

test("roster size accounts for other accepted trades", async () => {
  // BOS (20) sends 1 player to ANA for nothing... would be 19 -> blocked at propose already, so use 2-for-1s
  const t1 = ok(await propose(A, { to: "BOS", give: { players: ["ana01", "ana02"] }, get: { players: ["bos01"] } })).id; // ANA 20, BOS 21
  ok(await respond(B, t1, "accept"));
  // BOS now effectively has 21: giving 1 for nothing is OK (20), but ANA would then have 21 and CAR... fine
  ok(await propose(B, { to: "CAR", give: { players: ["bos02"] }, get: {} }));
  // ANA effectively has 20 now: giving 1 for nothing would leave 19
  assert.equal((await propose(A, { to: "CAR", give: { players: ["ana03"] }, get: {} })).status, 400);
});

test("counter-offers replace the original", async () => {
  const t1 = ok(await propose(A, oneForOne)).id;
  // only the recipient can counter, and it must be between the same two teams, reversed
  assert.equal((await propose(A, { ...oneForOne, counters: t1 })).status, 400);
  const t2 = ok(await propose(B, { to: "ANA", give: { players: ["bos01"] }, get: { players: ["ana01", "ana02"] }, counters: t1 })).id;
  const byId = Object.fromEntries(ok(await list(A)).trades.map((t) => [t.id, t]));
  assert.equal(byId[t1].status, "COUNTERED");
  assert.equal(byId[t2].status, "PROPOSED");
  assert.equal(byId[t2].counters, t1);
});

test("proposals expire when the next period's roster exists", async () => {
  const { id } = ok(await propose(A, oneForOne));
  const accepted = ok(await propose(A, { to: "CAR", give: { players: ["ana05"] }, get: { players: ["car05"] } })).id;
  ok(await respond(C, accepted, "accept"));
  files["src/data/static/2026-27/rosters/rosters_p08.csv"] = files["src/data/static/2026-27/rosters/rosters_p07.csv"];
  const l = ok(await list(A));
  assert.equal(l.period, 9);
  const byId = Object.fromEntries(l.trades.map((t) => [t.id, t.status]));
  assert.deepEqual(byId, { [id]: "EXPIRED", [accepted]: "APPLIED" });
  assert.equal((await respond(B, id, "accept")).status, 409);
});

test("rejects non-current seasons and malformed requests", async () => {
  assert.equal((await propose({ ...A, season: "2027-28" }, oneForOne)).status, 400);
  assert.equal((await post("/trades/propose", { team: "ANA" })).status, 400);
  assert.equal((await post("/trades/bogus", A)).status, 404);
});

// ---- Emails (EmailJS) ----------------------------------------------------------------------

const enableEmail = () => Object.assign(env, {
  EMAILJS_SERVICE_ID: "service_x", EMAILJS_TEMPLATE_ID: "template_x", EMAILJS_PUBLIC_KEY: "pub_x", EMAILJS_PRIVATE_KEY: "priv_x",
  SITE_URL: "https://site.example/dash/",
});
const sentTo = () => emails.map((e) => e.template_params.to_email).sort();

test("emails: nothing is sent (and nothing breaks) until EmailJS is configured", async () => {
  const { id } = ok(await propose(A, oneForOne));
  ok(await respond(B, id, "accept"));
  assert.equal(emails.length, 0);
});

test("emails: a proposal goes only to the other GM, with names, note and link, and no secrets", async () => {
  enableEmail();
  ok(await propose(A, { to: "BOS", give: { players: ["ana01"], picks: [{ pick: "WPG2", season: "2026-27" }] }, get: { players: ["bos01"] }, note: "fair deal?" }));
  assert.equal(emails.length, 1);
  const e = emails[0];
  assert.deepEqual([e.service_id, e.template_id, e.user_id, e.accessToken], ["service_x", "template_x", "pub_x", "priv_x"]);
  assert.deepEqual(Object.keys(e.template_params).sort(), ["message", "subject", "to_email", "to_name"]);
  assert.equal(e.template_params.to_email, "b@x.com");
  assert.equal(e.template_params.to_name, "B");
  assert.equal(e.template_params.subject, "FHL trade proposal from ANA");
  const m = e.template_params.message;
  for (const text of ["Anna One", "WPG2 (2026-27)", "Bo Sone", 'Note from ANA: "fair deal?"', "https://site.example/dash/Trades", "period 8"]) assert.ok(m.includes(text), text);
  assert.ok(!m.includes("ana01") && !m.includes("pwA") && !m.includes("pwB") && !m.includes("a@x.com") && !m.includes("priv_x"));
});

test("emails: accept notifies both GMs (no private note); decline goes to the proposer; withdraw to the recipient", async () => {
  enableEmail();
  const t1 = ok(await propose(A, { ...oneForOne, note: "secret note" })).id;
  emails.length = 0;
  ok(await respond(B, t1, "accept"));
  assert.deepEqual(sentTo(), ["a@x.com", "b@x.com"]);
  assert.ok(emails.every((e) => e.template_params.subject.startsWith("FHL trade agreed with")));
  assert.ok(emails.every((e) => /period 8/.test(e.template_params.message) && /lineup/.test(e.template_params.message) && /Roster/.test(e.template_params.message)));
  assert.ok(emails.every((e) => !e.template_params.message.includes("secret note")));

  emails.length = 0;
  const t2 = ok(await propose(A, { to: "CAR", give: { players: ["ana05"] }, get: { players: ["car05"] } })).id;
  emails.length = 0;
  ok(await respond(C, t2, "decline"));
  assert.deepEqual(sentTo(), ["a@x.com"]);
  assert.match(emails[0].template_params.subject, /declined by CAR/);

  const t3 = ok(await propose(A, { to: "CAR", give: { players: ["ana06"] }, get: { players: ["car06"] } })).id;
  emails.length = 0;
  ok(await respond(A, t3, "withdraw"));
  assert.deepEqual(sentTo(), ["c@x.com"]);
  assert.match(emails[0].template_params.subject, /withdrawn by ANA/);
});

test("emails: a counter-offer goes to the original proposer and says it replaces their proposal", async () => {
  enableEmail();
  const t1 = ok(await propose(A, oneForOne)).id;
  emails.length = 0;
  ok(await propose(B, { to: "ANA", give: { players: ["bos01"] }, get: { players: ["ana01", "ana02"] }, counters: t1 }));
  assert.deepEqual(sentTo(), ["a@x.com"]);
  assert.match(emails[0].template_params.subject, /counter-offer from BOS/);
  assert.match(emails[0].template_params.message, /replaces your earlier proposal/);
});

test("emails: a failing EmailJS never fails or blocks the trade action", async () => {
  enableEmail();
  emailStatus = 500;
  const { id } = ok(await propose(A, oneForOne));
  assert.equal(ok(await respond(B, id, "accept")).status, "ACCEPTED");
  assert.equal(ok(await list(A)).trades[0].status, "ACCEPTED");
});

test("emails: sent after the response when the platform provides waitUntil; a GM with no email address is skipped", async () => {
  enableEmail();
  const pending = [];
  const execCtx = { waitUntil: (p) => pending.push(p) };
  const r = await post("/trades/propose", { ...A, ...oneForOne }, ORIGIN, execCtx);
  assert.equal(r.status, 200);
  assert.equal(pending.length, 1);
  await Promise.all(pending);
  assert.equal(emails.length, 1);

  files["src/data/static/2026-27/owners.csv"] = "ABBR,OWNER,EMAIL,PW\nANA,A,a@x.com,pwA\nBOS,B,,pwB\nCAR,C,c@x.com,pwC\n";
  emails.length = 0;
  ok(await propose(A, { to: "BOS", give: { players: ["ana02"] }, get: { players: ["bos02"] } }));
  assert.equal(emails.length, 0); // BOS has no email on file
});

test("emails: an accepted trade is also announced to the league address, and only an accepted trade", async () => {
  enableEmail();
  env.LEAGUE_EMAIL = "league@x.com";
  const t1 = ok(await propose(A, { ...oneForOne, note: "secret note" })).id;
  assert.deepEqual(sentTo(), ["b@x.com"]); // proposing does not go to the league
  emails.length = 0;
  ok(await respond(B, t1, "accept"));
  assert.deepEqual(sentTo(), ["a@x.com", "b@x.com", "league@x.com"]);
  const league = emails.find((e) => e.template_params.to_email === "league@x.com").template_params;
  assert.equal(league.to_name, "FHL League");
  assert.equal(league.subject, "FHL trade: ANA and BOS");
  for (const text of ["ANA (A) and BOS (B)", "period 8", "Anna One", "Bo Sone", "https://site.example/dash/Trades"]) assert.ok(league.message.includes(text), text);
  assert.ok(!/secret note|lineup|pwA|pwB|a@x\.com|b@x\.com/.test(league.message));

  // declines and withdrawals stay between the two GMs
  const t2 = ok(await propose(A, { to: "CAR", give: { players: ["ana05"] }, get: { players: ["car05"] } })).id;
  emails.length = 0;
  ok(await respond(C, t2, "decline"));
  assert.ok(!sentTo().includes("league@x.com"));
});

test("emails: a failing league email does not affect the trade or the GM emails", async () => {
  enableEmail();
  env.LEAGUE_EMAIL = "league@x.com";
  const t1 = ok(await propose(A, oneForOne)).id;
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    if (String(url).startsWith("https://api.emailjs.com/") && JSON.parse(init.body).template_params.to_email === "league@x.com") return new Response("bad", { status: 422 });
    return realFetch(url, init);
  };
  emails.length = 0; // forget the proposal email; the wrapper above rejects the league email before it is recorded
  assert.equal(ok(await respond(B, t1, "accept")).status, "ACCEPTED");
  assert.deepEqual(sentTo(), ["a@x.com", "b@x.com"]); // both GMs were still told
  assert.equal(ok(await list(A)).trades[0].status, "ACCEPTED");
});
