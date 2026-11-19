// Cloudflare Worker: receives roster moves and trade proposals from the dashboard, checks the GM's password
// against owners.csv in the repo, and triggers GitHub workflows / stores trades in D1.
//
//   POST /                  roster moves  -> "Apply Roster Moves" workflow (repository_dispatch)
//   POST /trades/propose    propose (or counter) a trade            -> D1
//   POST /trades/list       this GM's proposals                     -> D1
//   POST /trades/respond    accept / decline / withdraw             -> D1 (+ repository_dispatch on accept)
//
// Secrets/vars (see worker/README.md):  GITHUB_TOKEN (secret), GITHUB_REPO, ALLOWED_ORIGIN, DB (D1 binding)
import { json, gh, authenticate, HttpError } from "./lib.js";
import { handleTrades } from "./trades.js";

export default {
  async fetch(request, env) {
    try {
      return await handle(request, env);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status, env.ALLOWED_ORIGIN);
      console.error(e);
      return json({ error: `Server error: ${e.message}` }, 500, env.ALLOWED_ORIGIN);
    }
  },
};

async function handle(request, env) {
  const origin = env.ALLOWED_ORIGIN;
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
  if (path.startsWith("/trades/")) {
    const result = await handleTrades(path.slice("/trades/".length), m, env);
    return json(result, 200, origin);
  }
  return handleMoves(m, env, origin);
}

async function handleMoves(m, env, origin) {
  const ids = (x) => Array.isArray(x) && x.length <= 40 && x.every((i) => typeof i === "string" && /^[\w.'-]{1,20}$/.test(i));
  if (!/^[A-Z]{2,4}$/.test(m.team ?? "") || !/^\d{4}-\d{2}$/.test(m.season ?? "") || !Number.isInteger(m.period) || !ids(m.promote) || !ids(m.demote))
    return json({ error: "Invalid request" }, 400, origin);

  await authenticate(env, m.season, m.team, m.password);

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
