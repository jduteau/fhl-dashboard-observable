// Shared helpers for the Worker: CSV parsing, JSON responses, GitHub access, GM authentication.

// Minimal CSV parser (handles quoted fields). d3-dsv can't be used: it relies on
// `new Function`, which Cloudflare Workers disallow.
export function csvParse(text) {
  const rows = [];
  let row = [], field = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') q = false;
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((v) => v !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  const [head, ...body] = rows;
  const cols = head.map((h) => h.trim());
  return body.map((r) => Object.fromEntries(cols.map((h, i) => [h, (r[i] ?? "").trim()])));
}

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

// Verify the GM's password against the current owners.csv (never exposed to the browser).
// Returns the owners rows (so callers can validate other teams / look up emails).
export async function authenticate(env, season, team, password) {
  const text = await ghFile(env, `src/data/static/${season}/owners.csv`);
  if (text === null) throw new HttpError(502, "Could not verify password");
  const owners = csvParse(text);
  const owner = owners.find((o) => o.ABBR === team);
  if (!owner || !owner.PW || owner.PW !== password) throw new HttpError(401, "Wrong password");
  return owners;
}
