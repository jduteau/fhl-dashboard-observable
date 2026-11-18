// Cloudflare Worker: receives roster moves from the dashboard, checks the GM's password
// against owners.csv in the repo, and triggers the "Apply Roster Moves" GitHub workflow.
//
// Secrets/vars (see worker/README.md):  GITHUB_TOKEN (secret), GITHUB_REPO, ALLOWED_ORIGIN
import { csvParse } from "d3-dsv";

const json = (body, status, origin) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "access-control-allow-origin": origin, vary: "origin" },
  });

const gh = (env, path, init = {}) =>
  fetch(`https://api.github.com/repos/${env.GITHUB_REPO}/${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${env.GITHUB_TOKEN}`,
      "user-agent": "fhl-roster-moves",
      accept: "application/vnd.github+json",
      ...init.headers,
    },
  });

export default {
  async fetch(request, env) {
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
    const ids = (x) => Array.isArray(x) && x.length <= 40 && x.every((i) => typeof i === "string" && /^[\w.'-]{1,20}$/.test(i));
    if (!/^[A-Z]{2,4}$/.test(m.team ?? "") || !/^\d{4}-\d{2}$/.test(m.season ?? "") || !Number.isInteger(m.period) || !ids(m.promote) || !ids(m.demote))
      return json({ error: "Invalid request" }, 400, origin);

    // Verify password against the current owners.csv (never exposed to the browser).
    const res = await gh(env, `contents/src/data/static/${m.season}/owners.csv`, { headers: { accept: "application/vnd.github.raw+json" } });
    if (!res.ok) return json({ error: "Could not verify password" }, 502, origin);
    const owner = csvParse((await res.text()).replace(/^﻿/, "")).find((o) => o.ABBR === m.team);
    if (!owner || !owner.PW || owner.PW !== m.password) return json({ error: "Wrong password" }, 401, origin);

    const dispatch = await gh(env, "dispatches", {
      method: "POST",
      body: JSON.stringify({
        event_type: "roster-moves",
        client_payload: { season: m.season, period: m.period, team: m.team, promote: m.promote, demote: m.demote },
      }),
    });
    if (dispatch.status !== 204) return json({ error: "Could not submit moves" }, 502, origin);
    return json({ ok: true }, 202, origin);
  },
};
