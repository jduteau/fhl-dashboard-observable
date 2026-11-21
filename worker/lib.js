// Shared helpers for the Worker: CSV parsing, JSON responses, GitHub access. (GM authentication is in accounts.js.)

// CSV parsing is shared with the GitHub scripts: src/components/csv.js (d3-dsv can't be used here: it relies on
// `new Function`, which Cloudflare Workers disallow).
export { csvParse } from "../src/components/csv.js";

// An error that should be reported to the caller with this HTTP status.
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const json = (body, status, origin) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "access-control-allow-origin": origin, vary: "origin" },
  });

export const gh = (env, path, init = {}) =>
  fetch(`https://api.github.com/repos/${env.GITHUB_REPO}/${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${env.GITHUB_TOKEN}`,
      "user-agent": "fhl-roster-moves",
      accept: "application/vnd.github+json",
      ...init.headers,
    },
  });

// Raw text of a repo file, or null if it doesn't exist.
export async function ghFile(env, path) {
  const res = await gh(env, `contents/${path}`, { headers: { accept: "application/vnd.github.raw+json" } });
  if (res.status === 404) return null;
  if (!res.ok) throw new HttpError(502, `Could not read ${path}`);
  return (await res.text()).replace(/^﻿/, "");
}

// Constant-time string comparison, so secrets can't be guessed from response timing.
export function sameSecret(a, b) {
  const x = new TextEncoder().encode(String(a)), y = new TextEncoder().encode(String(b));
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}
