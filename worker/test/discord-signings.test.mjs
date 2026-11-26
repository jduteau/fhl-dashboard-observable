// Run with: node --test worker/test/discord-signings.test.mjs
// Picking up signing announcements from a (fake) Discord channel.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import worker from "../index.js";

const schema = readFileSync(new URL("../schema.sql", import.meta.url), "utf-8");
let channel, dispatches, env, db, waited;
beforeEach(() => {
  channel = [];
  dispatches = [];
  waited = [];
  db = new DatabaseSync(":memory:");
  db.exec(schema);
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    run: async () => ({ meta: { changes: Number(db.prepare(sql).run(...args).changes) } }),
    first: async () => { const r = db.prepare(sql).get(...args); return r ? { ...r } : null; },
  });
  env = { DB: { prepare: (sql) => stmt(sql) }, GITHUB_REPO: "test/repo", GITHUB_TOKEN: "t", DISCORD_BOT_TOKEN: "bot", DISCORD_SIGNINGS_CHANNEL_ID: "42" };
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(url);
    if (u.host === "discord.com") {
      assert.equal(init.headers.authorization, "Bot bot");
      const after = u.searchParams.get("after");
      const list = channel.filter((m) => !after || BigInt(m.id) > BigInt(after)).reverse(); // Discord returns newest first
      return Response.json(after ? list : list.slice(0, 1));
    }
    const path = u.pathname.replace("/repos/test/repo/", "");
    if (path === "dispatches") { dispatches.push(JSON.parse(init.body)); return new Response(null, { status: 204 }); }
    if (path === "contents/src/data/static/seasons.csv") return new Response("season,label,current\n2026-27,2026-27,true\n");
    return new Response("not found", { status: 404 });
  };
});
const poll = async () => { await worker.scheduled({}, env, { waitUntil: (p) => waited.push(p) }); await Promise.all(waited); };
const msg = (id, content) => ({ id, content, timestamp: "2026-11-26T02:00:40.000+00:00" });

test("the first run only notes where the channel is; later signings are dispatched once", async () => {
  channel.push(msg("1", "CAR Old Timer  D  1111  1 C-27"));
  await poll();
  assert.equal(dispatches.length, 0);
  channel.push(msg("2", "chatter"), msg("3", "Wed Nov 25\n\nCAR Matt Kiersted             D  181781   1 C-27\nLAK Johnathan Kovacevic       D  175803   3 C-27\n\n2 players signed"));
  await poll();
  await poll(); // nothing new the second time
  assert.equal(dispatches.length, 1);
  assert.equal(dispatches[0].event_type, "discord-signing");
  assert.equal(dispatches[0].client_payload.messageId, "3");
  assert.equal(dispatches[0].client_payload.season, "2026-27");
  assert.deepEqual(dispatches[0].client_payload.signings.map((s) => [s.team, s.name, s.hockeyDb, s.salary]), [["CAR", "Matt Kiersted", "181781", 1], ["LAK", "Johnathan Kovacevic", "175803", 3]]);
});

test("does nothing without the bot secrets", async () => {
  delete env.DISCORD_BOT_TOKEN;
  channel.push(msg("1", "CAR Matt Kiersted D 181781 1 C-27"));
  await poll();
  assert.equal(db.prepare("SELECT count(*) AS n FROM discord_cursor").get().n, 0);
});
