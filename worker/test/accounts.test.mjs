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

// `ip` is the caller's address as Cloudflare reports it; leave it out for "no address" (local development)
const post = async (path, body, ip) => {
  const headers = { origin: ORIGIN, ...(ip ? { "cf-connecting-ip": ip } : {}) };
  const res = await worker.fetch(new Request(`https://worker.example${path}`, { method: "POST", headers, body: JSON.stringify(body) }), env);
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

// One at a time: the in-memory database used here cannot interleave transactions the way D1 can
const failures = async (path, body, n, ip) => { for (let i = 0; i < n; i++) await post(path, body, ip); };
const countFailures = () => db.prepare("SELECT COUNT(*) AS n FROM login_failures").get().n;
const addAccount = async (team, pw) => db.prepare("INSERT INTO gm_accounts (team, email, pw, updated_at) VALUES (?, '', ?, 'then')").run(team, await hashPassword(pw));

test("lockout: too many wrong passwords block that caller from that team (even with the right one) until the window passes", async () => {
  for (let i = 0; i < 10; i++) assert.equal((await post("/account/get", { team: "ANA", password: "wrong" }, "1.1.1.1")).status, 401);
  assert.equal((await post("/account/get", { team: "ANA", password: "pwA" }, "1.1.1.1")).status, 429);
  // other teams are unaffected for that caller
  await addAccount("BOS", "pwB");
  assert.equal((await post("/account/get", { team: "BOS", password: "pwB" }, "1.1.1.1")).status, 200);
  // once the failures are older than the window the caller can log in again
  db.prepare("UPDATE login_failures SET at = ?").run(new Date(Date.now() - 16 * 60 * 1000).toISOString());
  assert.equal((await post("/account/get", { team: "ANA", password: "pwA" }, "1.1.1.1")).status, 200);
});

test("lockout: a stranger guessing at a team cannot lock the real GM out (the lockout is per caller)", async () => {
  await failures("/account/get", { team: "ANA", password: "wrong" }, 10, "6.6.6.6");
  assert.equal((await post("/account/get", { team: "ANA", password: "pwA" }, "6.6.6.6")).status, 429); // the stranger is locked out...
  assert.equal((await post("/account/get", { team: "ANA", password: "pwA" }, "2.2.2.2")).status, 200); // ...the GM is not
  assert.equal((await post("/account/update", { team: "ANA", password: "pwA", email: "still@x.com" }, "2.2.2.2")).status, 200);
});

test("lockout: the same goes for the commissioner login", async () => {
  await failures("/account/admin-list", { password: "wrong" }, 10, "6.6.6.6");
  assert.equal((await post("/account/admin-list", { password: "boss" }, "6.6.6.6")).status, 429);
  assert.equal((await post("/account/admin-list", { password: "boss" }, "2.2.2.2")).status, 200); // the commissioner still gets in
  assert.equal((await post("/account/admin-set", { password: "boss", team: "ANA", newPassword: "reset-pw" }, "2.2.2.2")).status, 200);
});

test("lockout: one caller guessing across many teams is stopped, whether or not the teams exist", async () => {
  const guess = (team) => post("/account/get", { team, password: "wrong" }, "6.6.6.6");
  const teams = Array.from({ length: 40 }, (_, i) => `T${String.fromCharCode(65 + (i % 26))}${String.fromCharCode(65 + Math.floor(i / 26))}`); // 40 different names, none with an account
  for (const t of teams) assert.equal((await guess(t)).status, 401);
  assert.equal(countFailures(), 40); // unknown teams are recorded too
  assert.equal((await post("/account/get", { team: "ANA", password: "pwA" }, "6.6.6.6")).status, 429); // now locked out of everything, even a real login
  assert.equal((await post("/account/get", { team: "ANA", password: "pwA" }, "2.2.2.2")).status, 200); // other callers are fine
});

test("lockout: a correct password forgives this caller's earlier mistakes on that account, and nobody else's", async () => {
  await failures("/account/get", { team: "ANA", password: "wrong" }, 5, "1.1.1.1");
  await failures("/account/get", { team: "ANA", password: "wrong" }, 3, "2.2.2.2");
  assert.equal(countFailures(), 8);
  ok(await post("/account/get", { team: "ANA", password: "pwA" }, "1.1.1.1"));
  assert.equal(countFailures(), 3); // only the 3 from 2.2.2.2 remain
});

test("lockout: callers with no address share one bucket (local development and tests)", async () => {
  await failures("/account/get", { team: "ANA", password: "wrong" }, 10);
  assert.equal((await post("/account/get", { team: "ANA", password: "pwA" })).status, 429);
  assert.equal((await post("/account/get", { team: "ANA", password: "pwA" }, "2.2.2.2")).status, 200);
});

test("an unexpected failure returns a generic message, never the internal detail", async () => {
  const logged = [];
  const realError = console.error;
  console.error = (...a) => logged.push(a.map(String).join(" "));
  try {
    env.DB = { prepare: () => { throw new Error("secret internal detail: table gm_accounts"); } };
    const r = await post("/account/get", { team: "ANA", password: "pwA" }, "1.1.1.1");
    assert.equal(r.status, 500);
    assert.deepEqual(r.body, { error: "Server error" });
  } finally { console.error = realError; }
  assert.ok(logged.some((l) => /secret internal detail/.test(l))); // it is in the log for the owner to read
});

test("the old plaintext flow is gone: a password in owners.csv no longer authenticates", async () => {
  globalThis.fetch = async () => new Response("ABBR,OWNER,PW\nZZZ,Z,legacy\n");
  assert.equal((await post("/", { season: "2026-27", team: "ZZZ", password: "legacy", period: 8, promote: [], demote: [] })).status, 401);
});
