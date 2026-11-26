// Free-agent signings announced on Discord are picked up here and recorded without the commissioner typing them in.
// A cron trigger (wrangler.toml) calls pollDiscordSignings(); it reads the new messages of one channel with a bot token,
// parses the signing lines (src/components/signingRules.js) and sends ONE `discord-signing` repository_dispatch per message
// (Discord Signing workflow), which adds the players missing from player_info.csv and records the signings.
//
// Secrets: DISCORD_BOT_TOKEN, DISCORD_SIGNINGS_CHANNEL_ID. Unset, nothing happens. The bot only needs to see the channel
// (View Channel + Read Message History) and the "Message Content" intent must be on in the Discord developer portal.
// The last message handled is kept in D1 (table discord_cursor), so a message is dispatched once; the first run only
// remembers where the channel is now, it never replays old announcements.
import { csvParse, ghFile, gh } from "./lib.js";
import { parseSignings } from "../src/components/signingRules.js";

const KEY = "signings";

async function discordMessages(env, after) {
  const url = `https://discord.com/api/v10/channels/${env.DISCORD_SIGNINGS_CHANNEL_ID}/messages?limit=${after ? 100 : 1}${after ? `&after=${after}` : ""}`;
  const res = await fetch(url, { headers: { authorization: `Bot ${env.DISCORD_BOT_TOKEN}`, "user-agent": "fhl-roster-moves" } });
  if (!res.ok) throw new Error(`Discord returned HTTP ${res.status}`);
  const list = await res.json();
  // Discord ids are snowflakes: compare as numbers of equal-or-greater length, i.e. BigInt
  return list.sort((a, b) => (BigInt(a.id) < BigInt(b.id) ? -1 : 1));
}

export async function pollDiscordSignings(env) {
  if (!env.DISCORD_BOT_TOKEN || !env.DISCORD_SIGNINGS_CHANNEL_ID || !env.DB) return { skipped: true };
  const row = await env.DB.prepare("SELECT last_id FROM discord_cursor WHERE key = ?").bind(KEY).first();
  const messages = await discordMessages(env, row?.last_id);
  const save = (id) => env.DB.prepare("INSERT INTO discord_cursor (key, last_id) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET last_id = excluded.last_id").bind(KEY, id).run();
  if (!row) { if (messages.length) await save(messages.at(-1).id); return { started: true }; }
  if (!messages.length) return { dispatched: 0 };

  const seasons = csvParse((await ghFile(env, "src/data/static/seasons.csv")) ?? "");
  const season = seasons.find((s) => s.current === "true")?.season;
  if (!season) throw new Error("No current season in seasons.csv");

  let dispatched = 0;
  for (const m of messages) {
    const signings = parseSignings(m.content);
    if (signings.length) {
      const res = await gh(env, "dispatches", {
        method: "POST",
        body: JSON.stringify({ event_type: "discord-signing", client_payload: { season, messageId: m.id, at: m.timestamp, signings } }),
      });
      if (res.status !== 204) throw new Error(`Could not dispatch message ${m.id} (HTTP ${res.status})`); // cursor stays: tried again next run
      dispatched++;
    }
    await save(m.id);
  }
  return { dispatched };
}
