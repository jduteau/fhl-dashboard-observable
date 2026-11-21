// GM accounts: passwords (salted PBKDF2 hashes) and notification emails live in D1 (table gm_accounts, see schema.sql),
// never in the repository or the public site. owners.csv only supplies the public owner names.
//
//   POST /account/get          {team, password}                        -> {team, email}
//   POST /account/update       {team, password, newPassword?, email?}  -> {ok}      (a GM changes their own details)
//   POST /account/admin-list   {password: <ADMIN_PASSWORD>}            -> {accounts: [{team, email, updatedAt}]}
//   POST /account/admin-set    {password: <ADMIN_PASSWORD>, team, newPassword?, email?}  -> {ok}
//                              (commissioner: the only way to recover a forgotten password)
//
// Wrong passwords are throttled per caller in the login_failures table (see "Throttling" below).
import { csvParse, ghFile, HttpError, sameSecret } from "./lib.js";
import { normalizeRecipients } from "./email.js";
import { TEAM } from "../src/components/tradeRules.js";

const ITERATIONS = 100000; // the most Cloudflare Workers allow for PBKDF2
const MIN_PASSWORD = 6;
const MAX_PASSWORD = 100;
const MAX_FAILURES = 10;
const MAX_FAILURES_PER_CALLER = 40;
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
//
// Wrong passwords are counted per caller (the IP address Cloudflare reports), not just per account, so a stranger who
// keeps guessing locks only their own address out. That matters because a lockout that depended on the account alone
// would let anyone lock a GM, or the commissioner, out of their own account with a handful of requests.
//   * MAX_FAILURES wrong passwords for one account from one caller within the window locks that caller out of that account
//   * MAX_FAILURES_PER_CALLER wrong passwords of any kind from one caller locks that caller out of everything, which
//     stops one address from working through all the teams
// The same rules apply to the commissioner login (the account is then "*admin*").

const windowStart = () => new Date(Date.now() - FAILURE_WINDOW_MS).toISOString();

async function assertNotLockedOut(env, subject, client) {
  const since = windowStart();
  const [forAccount, forCaller] = await Promise.all([
    env.DB.prepare("SELECT COUNT(*) AS n FROM login_failures WHERE subject = ? AND ip = ? AND at > ?").bind(subject, client, since).first(),
    env.DB.prepare("SELECT COUNT(*) AS n FROM login_failures WHERE ip = ? AND at > ?").bind(client, since).first(),
  ]);
  if (forAccount.n >= MAX_FAILURES || forCaller.n >= MAX_FAILURES_PER_CALLER)
    throw new HttpError(429, "Too many wrong passwords from your address; try again in 15 minutes");
}

async function recordFailure(env, subject, client) {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM login_failures WHERE at <= ?").bind(windowStart()),
    env.DB.prepare("INSERT INTO login_failures (subject, ip, at) VALUES (?, ?, ?)").bind(subject, client, new Date().toISOString()),
  ]);
}

// A correct password forgives this caller's earlier mistakes on this account (and nobody else's)
const clearFailures = (env, subject, client) => env.DB.prepare("DELETE FROM login_failures WHERE subject = ? AND ip = ?").bind(subject, client).run();

// The caller's address as a short, safe string; "unknown" when there is none (local development, tests)
export const clientOf = (request) => (request.headers.get("cf-connecting-ip") ?? "unknown").slice(0, 64);

// ---- Authentication -------------------------------------------------------------------------

// Checks a GM's password; returns their account row {team, email}. `client` is the caller's address (see clientOf).
// Every wrong password counts towards the caller's lockout, including guesses at teams that have no account.
export async function checkPassword(env, team, password, client) {
  if (!env.DB) throw new HttpError(500, "Account database is not configured");
  await assertNotLockedOut(env, team, client);
  const account = await env.DB.prepare("SELECT team, email, pw FROM gm_accounts WHERE team = ?").bind(team).first();
  if (!account || !(await verifyPassword(password, account.pw))) {
    await recordFailure(env, team, client);
    throw new HttpError(401, "Wrong password");
  }
  await clearFailures(env, team, client);
  return { team: account.team, email: account.email };
}

// Verifies the GM's password and returns the owners rows ({ABBR, OWNER, EMAIL}) so callers can validate other teams
// and look up whom to email. Names come from the public owners.csv, emails from D1 (never sent to the browser).
export async function authenticate(env, season, team, password, client) {
  await checkPassword(env, team, password, client);
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

export async function assertAdmin(env, password, client) {
  if (!env.DB) throw new HttpError(500, "Account database is not configured");
  if (!env.ADMIN_PASSWORD) throw new HttpError(403, "Commissioner access is not set up");
  await assertNotLockedOut(env, ADMIN_KEY, client);
  if (typeof password !== "string" || !sameSecret(password, env.ADMIN_PASSWORD)) {
    await recordFailure(env, ADMIN_KEY, client);
    throw new HttpError(401, "Wrong password");
  }
  await clearFailures(env, ADMIN_KEY, client);
}

export async function handleAccount(action, body, env, client) {
  if (typeof body.password !== "string") throw bad("Invalid request");
  switch (action) {
    case "get": {
      if (!TEAM.test(body.team ?? "")) throw bad("Invalid request");
      const account = await checkPassword(env, body.team, body.password, client);
      return { team: account.team, email: account.email };
    }
    case "update": {
      if (!TEAM.test(body.team ?? "")) throw bad("Invalid request");
      const changes = parseChanges(body); // validate before touching the throttle or the database
      await checkPassword(env, body.team, body.password, client);
      await save(env, body.team, changes);
      return { ok: true };
    }
    case "admin-list": {
      await assertAdmin(env, body.password, client);
      const { results } = await env.DB.prepare("SELECT team, email, updated_at FROM gm_accounts ORDER BY team").all();
      return { accounts: results.map((a) => ({ team: a.team, email: a.email, updatedAt: a.updated_at })) };
    }
    case "admin-set": {
      if (!TEAM.test(body.team ?? "")) throw bad("Invalid request");
      const changes = parseChanges(body);
      await assertAdmin(env, body.password, client);
      await save(env, body.team, changes);
      return { ok: true };
    }
    default:
      throw new HttpError(404, "Unknown account endpoint");
  }
}
