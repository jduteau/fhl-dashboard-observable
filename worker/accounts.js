// GM accounts: passwords (salted PBKDF2 hashes) and notification emails live in D1 (table gm_accounts, see schema.sql),
// never in the repository or the public site. owners.csv only supplies the public owner names.
//
//   POST /account/get          {team, password}                        -> {team, email}
//   POST /account/update       {team, password, newPassword?, email?}  -> {ok}      (a GM changes their own details)
//   POST /account/admin-list   {password: <ADMIN_PASSWORD>}            -> {accounts: [{team, email, updatedAt}]}
//   POST /account/admin-set    {password: <ADMIN_PASSWORD>, team, newPassword?, email?}  -> {ok}
//                              (commissioner: the only way to recover a forgotten password)
//
// Failed logins are throttled per team (MAX_FAILURES within FAILURE_WINDOW_MS) in the auth_failures table.
import { csvParse, ghFile, HttpError, sameSecret } from "./lib.js";
import { normalizeRecipients } from "./email.js";

const TEAM = /^[A-Z]{2,4}$/;
const ITERATIONS = 100000; // the most Cloudflare Workers allow for PBKDF2
const MIN_PASSWORD = 6;
const MAX_PASSWORD = 100;
const MAX_FAILURES = 10;
const FAILURE_WINDOW_MS = 15 * 60 * 1000;
const ADMIN_KEY = "*admin*";

const bad = (message) => new HttpError(400, message);

// ---- Password hashing (WebCrypto; also used by seed-accounts.mjs under Node) ---------------

const b64 = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function derive(password, salt, iterations) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256));
}

// "pbkdf2$<iterations>$<salt>$<hash>": the iteration count travels with the hash so it can be raised later.
export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$${ITERATIONS}$${b64(salt)}$${b64(await derive(password, salt, ITERATIONS))}`;
}

export async function verifyPassword(password, stored) {
  const [scheme, iterations, salt, hash] = String(stored ?? "").split("$");
  if (scheme !== "pbkdf2" || !salt || !hash) return false;
  const expected = unb64(hash);
  const actual = await derive(password, unb64(salt), Number(iterations));
  let diff = expected.length ^ actual.length;
  for (let i = 0; i < actual.length; i++) diff |= (expected[i] ?? 0) ^ actual[i];
  return diff === 0;
}

// ---- Throttling -----------------------------------------------------------------------------

const windowStart = () => new Date(Date.now() - FAILURE_WINDOW_MS).toISOString();

async function assertNotLockedOut(env, key) {
  const row = await env.DB.prepare("SELECT COUNT(*) AS n FROM auth_failures WHERE team = ? AND at > ?").bind(key, windowStart()).first();
  if (row.n >= MAX_FAILURES) throw new HttpError(429, "Too many wrong passwords; try again in 15 minutes");
}

async function recordFailure(env, key) {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM auth_failures WHERE at <= ?").bind(windowStart()),
    env.DB.prepare("INSERT INTO auth_failures (team, at) VALUES (?, ?)").bind(key, new Date().toISOString()),
  ]);
}

const clearFailures = (env, key) => env.DB.prepare("DELETE FROM auth_failures WHERE team = ?").bind(key).run();

// ---- Authentication -------------------------------------------------------------------------

// Checks a GM's password; returns their account row {team, email}. Wrong passwords count towards the lockout
// (only for teams that have an account, so unknown names can't fill the table).
export async function checkPassword(env, team, password) {
  if (!env.DB) throw new HttpError(500, "Account database is not configured");
  await assertNotLockedOut(env, team);
  const account = await env.DB.prepare("SELECT team, email, pw FROM gm_accounts WHERE team = ?").bind(team).first();
  if (!account) throw new HttpError(401, "Wrong password");
  if (!(await verifyPassword(password, account.pw))) {
    await recordFailure(env, team);
    throw new HttpError(401, "Wrong password");
  }
  await clearFailures(env, team);
  return { team: account.team, email: account.email };
}

// Verifies the GM's password and returns the owners rows ({ABBR, OWNER, EMAIL}) so callers can validate other teams
// and look up whom to email. Names come from the public owners.csv, emails from D1 (never sent to the browser).
export async function authenticate(env, season, team, password) {
  await checkPassword(env, team, password);
  const text = await ghFile(env, `src/data/static/${season}/owners.csv`);
  if (text === null) throw new HttpError(502, "Could not verify password");
  const { results } = await env.DB.prepare("SELECT team, email FROM gm_accounts").all();
  const emails = new Map(results.map((a) => [a.team, a.email]));
  return csvParse(text).map((o) => ({ ABBR: o.ABBR, OWNER: o.OWNER, EMAIL: emails.get(o.ABBR) ?? "" }));
}

// ---- Endpoints ------------------------------------------------------------------------------

function parseChanges(body) {
  const { newPassword, email } = body;
  if (newPassword === undefined && email === undefined) throw bad("Nothing to change");
  if (newPassword !== undefined) {
    if (typeof newPassword !== "string" || newPassword.length < MIN_PASSWORD || newPassword.length > MAX_PASSWORD)
      throw bad(`The new password must be ${MIN_PASSWORD}-${MAX_PASSWORD} characters`);
  }
  let normalized;
  if (email !== undefined) {
    if (typeof email !== "string" || email.length > 300) throw bad("Invalid email address");
    const { good, bad: invalid } = normalizeRecipients(email);
    if (invalid) throw bad("Invalid email address (separate several with commas)");
    normalized = good; // "" clears it: no trade emails for this GM
  }
  return { newPassword, email: normalized };
}

async function save(env, team, { newPassword, email }) {
  const existing = await env.DB.prepare("SELECT team FROM gm_accounts WHERE team = ?").bind(team).first();
  const now = new Date().toISOString();
  if (!existing) {
    if (newPassword === undefined) throw bad(`${team} has no account yet: set a password too`);
    await env.DB.prepare("INSERT INTO gm_accounts (team, email, pw, updated_at) VALUES (?, ?, ?, ?)")
      .bind(team, email ?? "", await hashPassword(newPassword), now).run();
    return;
  }
  const sets = ["updated_at = ?"];
  const args = [now];
  if (newPassword !== undefined) { sets.push("pw = ?"); args.push(await hashPassword(newPassword)); }
  if (email !== undefined) { sets.push("email = ?"); args.push(email); }
  await env.DB.prepare(`UPDATE gm_accounts SET ${sets.join(", ")} WHERE team = ?`).bind(...args, team).run();
}

export async function assertAdmin(env, password) {
  if (!env.DB) throw new HttpError(500, "Account database is not configured");
  if (!env.ADMIN_PASSWORD) throw new HttpError(403, "Commissioner access is not set up");
  await assertNotLockedOut(env, ADMIN_KEY);
  if (typeof password !== "string" || !sameSecret(password, env.ADMIN_PASSWORD)) {
    await recordFailure(env, ADMIN_KEY);
    throw new HttpError(401, "Wrong password");
  }
  await clearFailures(env, ADMIN_KEY);
}

export async function handleAccount(action, body, env) {
  if (typeof body.password !== "string") throw bad("Invalid request");
  switch (action) {
    case "get": {
      if (!TEAM.test(body.team ?? "")) throw bad("Invalid request");
      const account = await checkPassword(env, body.team, body.password);
      return { team: account.team, email: account.email };
    }
    case "update": {
      if (!TEAM.test(body.team ?? "")) throw bad("Invalid request");
      const changes = parseChanges(body); // validate before touching the throttle or the database
      await checkPassword(env, body.team, body.password);
      await save(env, body.team, changes);
      return { ok: true };
    }
    case "admin-list": {
      await assertAdmin(env, body.password);
      const { results } = await env.DB.prepare("SELECT team, email, updated_at FROM gm_accounts ORDER BY team").all();
      return { accounts: results.map((a) => ({ team: a.team, email: a.email, updatedAt: a.updated_at })) };
    }
    case "admin-set": {
      if (!TEAM.test(body.team ?? "")) throw bad("Invalid request");
      const changes = parseChanges(body);
      await assertAdmin(env, body.password);
      await save(env, body.team, changes);
      return { ok: true };
    }
    default:
      throw new HttpError(404, "Unknown account endpoint");
  }
}
