// Run with: node --test worker/test/
// GM accounts: hashing, self-service changes, commissioner resets and the failed-login lockout.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import worker from "../index.js";
import { hashPassword, verifyPassword } from "../accounts.js";

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

const hashA = await hashPassword("pwA");
let db, env;
beforeEach(() => {
  db = new DatabaseSync(":memory:");
  db.exec(schema);
  db.prepare("INSERT INTO gm_accounts (team, email, pw, updated_at) VALUES ('ANA', 'a@x.com', ?, 'then')").run(hashA);
  env = { DB: d1(db), ADMIN_PASSWORD: "boss", GITHUB_REPO: "test/repo", GITHUB_TOKEN: "t", ALLOWED_ORIGIN: ORIGIN };
});

const post = async (path, body) => {
  const res = await worker.fetch(new Request(`https://worker.example${path}`, { method: "POST", headers: { origin: ORIGIN }, body: JSON.stringify(body) }), env);
  return { status: res.status, body: await res.json() };
};
const row = (team) => db.prepare("SELECT * FROM gm_accounts WHERE team = ?").get(team);

test("hashing: salted, verifiable, and the plaintext is not stored", async () => {
  const a = await hashPassword("secret1"), b = await hashPassword("secret1");
  assert.notEqual(a, b); // different salts
  assert.ok(a.startsWith("pbkdf2$"));
  assert.ok(!a.includes("secret1"));
  assert.equal(await verifyPassword("secret1", a), true);
  assert.equal(await verifyPassword("secret2", a), false);
  assert.equal(await verifyPassword("secret1", "garbage"), false);
  assert.equal(await verifyPassword("secret1", null), false);
});

test("get: returns the GM's own email after a correct password only", async () => {
  assert.deepEqual((await post("/account/get", { team: "ANA", password: "pwA" })).body, { team: "ANA", email: "a@x.com" });
  assert.equal((await post("/account/get", { team: "ANA", password: "nope" })).status, 401);
  assert.equal((await post("/account/get", { team: "ZZZ", password: "pwA" })).status, 401); // no account
  assert.equal((await post("/account/get", { team: "ana", password: "pwA" })).status, 400);
});

test("update: a GM can change their password and email; the old password stops working", async () => {
  const r = await post("/account/update", { team: "ANA", password: "pwA", newPassword: "better-pw", email: "new@x.com, other@x.com" });
  assert.equal(r.status, 200);
  assert.equal(row("ANA").email, "new@x.com,other@x.com");
  assert.ok(!row("ANA").pw.includes("better-pw"));
  assert.equal((await post("/account/get", { team: "ANA", password: "pwA" })).status, 401);
  assert.equal((await post("/account/get", { team: "ANA", password: "better-pw" })).status, 200);
});

test("update: email only leaves the password alone, and an empty email clears it", async () => {
  const before = row("ANA").pw;
  ok(await post("/account/update", { team: "ANA", password: "pwA", email: "" }));
  assert.equal(row("ANA").email, "");
  assert.equal(row("ANA").pw, before);
  assert.equal((await post("/account/get", { team: "ANA", password: "pwA" })).status, 200);
});
const ok = (r) => { assert.equal(r.status, 200, JSON.stringify(r.body)); return r.body; };

test("update: wrong current password, weak password, bad email and an empty request change nothing", async () => {
  const before = { ...row("ANA") }; const same = () => ({ ...row("ANA") });
  assert.equal((await post("/account/update", { team: "ANA", password: "nope", newPassword: "better-pw" })).status, 401);
  assert.equal((await post("/account/update", { team: "ANA", password: "pwA", newPassword: "123" })).status, 400);
  assert.equal((await post("/account/update", { team: "ANA", password: "pwA", email: "not-an-address" })).status, 400);
  assert.equal((await post("/account/update", { team: "ANA", password: "pwA", email: "a@x.com, junk" })).status, 400);
  assert.equal((await post("/account/update", { team: "ANA", password: "pwA" })).status, 400);
  assert.deepEqual(same(), before);
});

test("admin: the commissioner sets a forgotten password and creates accounts; GM passwords don't work as admin", async () => {
  assert.equal((await post("/account/admin-set", { password: "pwA", team: "ANA", newPassword: "reset-pw" })).status, 401);
  ok(await post("/account/admin-set", { password: "boss", team: "ANA", newPassword: "reset-pw" }));
  assert.equal(row("ANA").email, "a@x.com"); // email untouched
  assert.equal((await post("/account/get", { team: "ANA", password: "reset-pw" })).status, 200);

  ok(await post("/account/admin-set", { password: "boss", team: "BOS", newPassword: "bos-pw", email: "b@x.com" }));
  assert.equal(row("BOS").email, "b@x.com");
  assert.equal((await post("/account/admin-set", { password: "boss", team: "CAR", email: "c@x.com" })).status, 400); // new account needs a password

  const list = ok(await post("/account/admin-list", { password: "boss" }));
  assert.deepEqual(list.accounts.map((a) => a.team), ["ANA", "BOS"]);
  assert.ok(list.accounts.every((a) => !("pw" in a)));
  assert.equal((await post("/account/admin-list", { password: "pwA" })).status, 401);
});

test("admin: refused when ADMIN_PASSWORD is not set up", async () => {
  delete env.ADMIN_PASSWORD;
  assert.equal((await post("/account/admin-list", { password: "" })).status, 403);
});

test("lockout: too many wrong passwords block the team (even the right one) until the window passes", async () => {
  for (let i = 0; i < 10; i++) assert.equal((await post("/account/get", { team: "ANA", password: "wrong" })).status, 401);
  assert.equal((await post("/account/get", { team: "ANA", password: "pwA" })).status, 429);
  // other teams are unaffected by ANA's lockout
  db.prepare("INSERT INTO gm_accounts (team, email, pw, updated_at) VALUES ('BOS', '', ?, 'then')").run(await hashPassword("pwB"));
  assert.equal((await post("/account/get", { team: "BOS", password: "pwB" })).status, 200);
  // once the failures are older than the window the team can log in again
  db.prepare("UPDATE auth_failures SET at = ?").run(new Date(Date.now() - 16 * 60 * 1000).toISOString());
  assert.equal((await post("/account/get", { team: "ANA", password: "pwA" })).status, 200);
});

test("lockout: a correct password clears earlier failures; unknown teams are not recorded; admin is throttled too", async () => {
  for (let i = 0; i < 5; i++) await post("/account/get", { team: "ANA", password: "wrong" });
  ok(await post("/account/get", { team: "ANA", password: "pwA" }));
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM auth_failures").get().n, 0);

  await post("/account/get", { team: "XYZ", password: "wrong" });
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM auth_failures").get().n, 0);

  for (let i = 0; i < 10; i++) await post("/account/admin-list", { password: "wrong" });
  assert.equal((await post("/account/admin-list", { password: "boss" })).status, 429);
});

test("the old plaintext flow is gone: a password in owners.csv no longer authenticates", async () => {
  globalThis.fetch = async () => new Response("ABBR,OWNER,PW\nZZZ,Z,legacy\n");
  assert.equal((await post("/", { season: "2026-27", team: "ZZZ", password: "legacy", period: 8, promote: [], demote: [] })).status, 401);
});
