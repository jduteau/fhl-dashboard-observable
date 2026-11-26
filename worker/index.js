// Cloudflare Worker: receives roster moves and trade proposals from the dashboard, checks the GM's password
// against the hashed accounts in D1, and triggers GitHub workflows / stores trades in D1.
//
//   POST /                  roster moves  -> "Apply Roster Moves" workflow (repository_dispatch)
//   POST /trades/propose    propose (or counter) a trade            -> D1
//   POST /trades/list       this GM's proposals                     -> D1
//   POST /trades/respond    accept / decline / withdraw             -> D1 (+ repository_dispatch on accept)
//   POST /transactions/add|remove   the commissioner records / removes a free-agent signing or waiver cut -> "Record Transactions" workflow
//   POST /players/add               the commissioner adds a player to player_info.csv -> "Add Player" workflow
//   (cron)                  Discord signing announcements -> "Discord Signing" workflow (discord-signings.js)
//   POST /account/*         a GM changes their password/email; the commissioner resets them (see accounts.js)
//
// Secrets/vars (see worker/README.md):  GITHUB_TOKEN (secret), GITHUB_REPO, ALLOWED_ORIGIN, DB (D1 binding)
import { json, gh, HttpError } from "./lib.js";
import { authenticate, handleAccount, clientOf } from "./accounts.js";
import { TEAM, PLAYER, SEASON } from "../src/components/tradeRules.js";
import { handleTrades, loadContext } from "./trades.js";
import { handleTransactions } from "./transactions.js";
import { handlePlayers } from "./players.js";
import { pollDiscordSignings } from "./discord-signings.js";

// ALLOWED_ORIGIN is a comma-separated list (the Pages site, plus local preview origins for development).
// The request's own origin is echoed back when it is on the list, otherwise the first entry is returned (and the
// request is refused), so CORS headers always name exactly one origin.
const originFor = (request, env) => {
  const allowed = env.ALLOWED_ORIGIN.split(",").map((o) => o.trim()).filter(Boolean);
  const requested = request.headers.get("origin");
  return allowed.includes(requested) ? requested : allowed[0];
};

export default {
  // Cron trigger (wrangler.toml): pick up free-agent signings announced on Discord (see discord-signings.js)
  async scheduled(_event, env, execCtx) {
    execCtx.waitUntil(pollDiscordSignings(env).catch((e) => console.error("Discord signings:", e.message)));
  },
  async fetch(request, env, execCtx) {
    const origin = originFor(request, env);
    try {
      return await handle(request, env, origin, execCtx);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status, origin);
      console.error(e);
      return json({ error: "Server error" }, 500, origin); // the details are in the log, not for the browser
    }
  },
};

async function handle(request, env, origin, execCtx) {
  if (request.method === "OPTIONS")
    return new Response(null, {
      headers: {
        "access-control-allow-origin": origin,
        "access-control-allow-methods": "POST",
        "access-control-allow-headers": "content-type",
        "access-control-max-age": "86400",
      },
    });
  if (request.method !== "POST") return json({ error: "POST only" }, 405, origin);
  if (request.headers.get("origin") !== origin) return json({ error: "Forbidden origin" }, 403, origin);

  let m;
  try { m = await request.json(); } catch { return json({ error: "Bad JSON" }, 400, origin); }
  if (m === null || typeof m !== "object") return json({ error: "Bad JSON" }, 400, origin);

  const path = new URL(request.url).pathname.replace(/\/+$/, "");
  const client = clientOf(request);
  if (path.startsWith("/trades/")) {
    const result = await handleTrades(path.slice("/trades/".length), m, env, execCtx, client);
    return json(result, 200, origin);
  }
  if (path.startsWith("/transactions/")) {
    const result = await handleTransactions(path.slice("/transactions/".length), m, env, client);
    return json(result, 200, origin);
  }
  if (path.startsWith("/players/")) {
    const result = await handlePlayers(path.slice("/players/".length), m, env, client);
    return json(result, 200, origin);
  }
  if (path.startsWith("/account/")) {
    const result = await handleAccount(path.slice("/account/".length), m, env, client);
    return json(result, 200, origin);
  }
  return handleMoves(m, env, origin, client);
}

async function handleMoves(m, env, origin, client) {
  const ids = (x) => Array.isArray(x) && x.length <= 40 && x.every((i) => typeof i === "string" && PLAYER.test(i));
  if (!TEAM.test(m.team ?? "") || !SEASON.test(m.season ?? "") || !Number.isInteger(m.period) || !ids(m.promote) || !ids(m.demote))
    return json({ error: "Invalid request" }, 400, origin);

  await authenticate(env, m.season, m.team, m.password, client);

  // Moves are for the period after the latest rosters_pNN.csv. Once that period's roster file exists (the commissioner
  // materialized it) its lineups are final, even if the period has not started yet.
  const ctx = await loadContext(env, m.season);
  if (m.period <= ctx.latest) return json({ error: `Roster moves for period ${m.period} are closed: its rosters have been created` }, 409, origin);
  if (m.period !== ctx.period) return json({ error: `Moves are for period ${m.period} but the next period is ${ctx.period} (stale page?)` }, 409, origin);

  const dispatch = await gh(env, "dispatches", {
    method: "POST",
    body: JSON.stringify({
      event_type: "roster-moves",
      client_payload: { season: m.season, period: m.period, team: m.team, promote: m.promote, demote: m.demote },
    }),
  });
  if (dispatch.status !== 204) return json({ error: "Could not submit moves" }, 502, origin);
  return json({ ok: true }, 202, origin);
}
