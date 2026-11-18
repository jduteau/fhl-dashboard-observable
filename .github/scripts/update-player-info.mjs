// Adds players that appear in a stats download but are missing from
// src/data/static/<season>/player_info.csv.
//
// Usage: node update-player-info.mjs <season> [period]   e.g. 2026-27 07
//   (no period => every stats_pNN.csv of the season is checked)
//
// Designed to be polite, because Hockey-Reference and HockeyDB block bots and
// high-frequency access:
//   * Does nothing (zero network calls) when no player is missing.
//   * Resolves name / birthdate / team from the NHL's own public API first
//     (no bot protection), so Hockey-Reference is only hit for the leftovers.
//   * Every Hockey-Reference / HockeyDB request is spaced 6-10s apart (random
//     jitter; HR's robots.txt asks for >= 3s), goes through one serial queue,
//     and a run is capped at MAX_SITE_REQUESTS requests. Leftovers are simply
//     picked up by the next daily run.
//   * Any 403 / 429 / 503 / challenge page stops all further requests to that
//     site for the run (no retries, no hammering). The player is still added
//     with the fields that could be resolved; the missing HockeyDB id is
//     back-filled on a later run.
//   * Uses a plain identifying User-Agent and does not try to bypass
//     challenges. The script never fails the workflow because of a site block.
//
// PuckPedia blocks scripted access outright, so its slug is derived from the
// name (correct for ~99% of existing rows) and never fetched.
import { readFileSync, writeFileSync, readdirSync, existsSync } from "fs";

const MAX_SITE_REQUESTS = Number(process.env.MAX_SITE_REQUESTS ?? 40);
const MIN_DELAY_MS = Number(process.env.MIN_DELAY_MS ?? 6000);
const JITTER_MS = Number(process.env.JITTER_MS ?? 4000);
const USER_AGENT =
  process.env.SCRAPER_UA ?? "FHL-Dashboard-PlayerInfo/1.0 (personal fantasy hockey league dashboard; low-volume, 1 request per ~8s)";
const DRY_RUN = process.env.DRY_RUN === "1";

const NHL_TEAMS = [
  "ANA", "BOS", "BUF", "CAR", "CBJ", "CGY", "CHI", "COL", "DAL", "DET", "EDM", "FLA", "LAK", "MIN", "MTL", "NJD",
  "NSH", "NYI", "NYR", "OTT", "PHI", "PIT", "SEA", "SJS", "STL", "TBL", "TOR", "UTA", "VAN", "VGK", "WPG", "WSH",
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log("[player-info]", ...a);

// ---------- CSV helpers (player_info.csv has no quoted fields beyond simple names) ----------
function parseCsv(path) {
  const [header, ...rows] = readFileSync(path, "utf-8").replace(/^﻿/, "").trim().split(/\r?\n/);
  const cols = header.split(",").map((c) => c.trim());
  return rows.filter(Boolean).map((r) => Object.fromEntries(r.split(",").map((v, i) => [cols[i], v.trim()])));
}

// ---------- Polite, serial, budgeted fetching for the protected sites ----------
const sites = {}; // host -> {blocked, lastRequest}
let siteRequests = 0;

async function politeGet(url) {
  const host = new URL(url).host;
  const site = (sites[host] ??= { blocked: false, last: 0 });
  if (site.blocked) return null;
  if (siteRequests >= MAX_SITE_REQUESTS) {
    log(`request budget (${MAX_SITE_REQUESTS}) used up; remaining work deferred to the next run`);
    return null;
  }
  const wait = site.last + MIN_DELAY_MS + Math.random() * JITTER_MS - Date.now();
  if (wait > 0) await sleep(wait);
  siteRequests++;
  site.last = Date.now();
  let res;
  try {
    res = await fetch(url, {
      redirect: "follow",
      headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml", "Accept-Language": "en" },
      signal: AbortSignal.timeout(30000),
    });
  } catch (e) {
    log(`${host}: network error (${e.message}); skipping`);
    return null;
  }
  const body = await res.text();
  const challenged = /cf-browser-verification|Just a moment\.\.\.|captcha|Access Denied/i.test(body.slice(0, 4000));
  if ([403, 429, 503].includes(res.status) || challenged) {
    site.blocked = true;
    log(`${host}: ${res.status}${challenged ? " (challenge page)" : ""} - stopping all requests to this site for this run` +
      (res.headers.get("retry-after") ? ` (Retry-After: ${res.headers.get("retry-after")})` : ""));
    return null;
  }
  if (!res.ok) {
    log(`${host}: HTTP ${res.status} for ${url}`);
    return null;
  }
  return { url: res.url, body };
}

// ---------- NHL API (no bot protection) ----------
const normalize = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z]/g, "");

async function fetchNhlRosters(season) {
  const [start] = season.split("-");
  const seasonStrs = [`${start}${Number(start) + 1}`, `${Number(start) - 1}${start}`]; // current, then previous
  const entries = []; // earlier entries (current season) win
  for (const s of seasonStrs) {
    for (const team of NHL_TEAMS) {
      try {
        const res = await fetch(`https://api-web.nhle.com/v1/roster/${team}/${s}`, { signal: AbortSignal.timeout(20000) });
        if (!res.ok) continue;
        const data = await res.json();
        for (const g of [data.forwards, data.defensemen, data.goalies])
          for (const p of g ?? [])
            entries.push({ id: p.id, first: p.firstName?.default ?? "", last: p.lastName?.default ?? "", birthDate: p.birthDate, team });
      } catch { /* a missing team/season is fine */ }
      await sleep(100);
    }
  }
  const byId = new Map();
  for (const e of entries) if (!byId.has(e.id)) byId.set(e.id, e);
  return [...byId.values()];
}

// Hockey-Reference id = 5 letters of last name + 2 of first name + 2-digit disambiguator.
// Only trusted when the disambiguator is "01" and exactly one roster entry matches.
function matchHockeyRefId(id, roster) {
  const m = id.match(/^([a-z]+?)([a-z]{2})(\d{2})$/);
  if (!m || m[3] !== "01") return null;
  const [, last, first] = m;
  const hits = roster.filter((e) => normalize(e.last).startsWith(last) && normalize(e.first).startsWith(first));
  return hits.length === 1 ? hits[0] : null;
}

// ---------- Hockey-Reference player page (fallback; 1 slow request) ----------
async function fetchHockeyRefPage(id) {
  const res = await politeGet(`https://www.hockey-reference.com/players/${id[0]}/${id}.html`);
  if (!res) return null;
  const name = res.body.match(/<div[^>]*id="meta"[\s\S]*?<h1>\s*<span>([^<]+)<\/span>/)?.[1]?.trim();
  const birthDate = res.body.match(/id="necro-birth"[^>]*data-birth="(\d{4}-\d{2}-\d{2})"/)?.[1];
  return name && birthDate ? { name: decodeHtml(name), birthDate } : null;
}
const decodeHtml = (s) => s.replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, "&").replace(/&quot;/g, '"');

// ---------- HockeyDB id (1 slow request; unique name redirects straight to the player) ----------
async function fetchHockeyDbId(name, birthDate) {
  const res = await politeGet(`https://www.hockeydb.com/ihdb/stats/find_player.php?full_name=${encodeURIComponent(name)}`);
  if (!res) return null;
  const direct = res.url.match(/pdisplay\.php\?pid=(\d+)/);
  if (direct) return direct[1];
  // Several players share the name: pick the one whose year of birth matches.
  const year = birthDate.slice(0, 4);
  const rows = [...res.body.matchAll(/<tr data-status='[^']*'>[\s\S]*?pdisplay\.php\?pid=(\d+)[\s\S]*?<td class='col-yob'>(\d{4})<\/td>/g)];
  const hits = rows.filter((r) => r[2] === year);
  if (hits.length === 1) return hits[0][1];
  log(`HockeyDB: ${hits.length === 0 ? "no" : "ambiguous"} match for ${name} (${birthDate}); left blank`);
  return null;
}

// PuckPedia slug: "Marc Del Gaizo" -> "marc-del-gaizo" (not always exact, e.g. "marc-delgaizo"; fix by hand).
const puckPediaSlug = (name) =>
  name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/['’.]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// ---------- main ----------
const [season, periodArg] = process.argv.slice(2);
if (!season) throw new Error("Usage: node update-player-info.mjs <season> [period]");
const seasonDir = `src/data/static/${season}`;
const infoPath = `${seasonDir}/player_info.csv`;
const info = parseCsv(infoPath);
const known = new Set(info.map((p) => p.ID));

const statsFiles = periodArg
  ? [`${seasonDir}/stats/stats_p${periodArg.padStart(2, "0")}.csv`]
  : readdirSync(`${seasonDir}/stats`).filter((f) => /^stats_p\d+\.csv$/.test(f)).sort().map((f) => `${seasonDir}/stats/${f}`);

const missing = new Map(); // id -> {team, pos}  (later files overwrite earlier ones)
for (const f of statsFiles.filter(existsSync))
  for (const r of parseCsv(f)) if (r.hockeyRef && !known.has(r.hockeyRef)) missing.set(r.hockeyRef, { team: r.team, pos: r.pos });

// Rows added earlier whose HockeyDB id could not be found yet get retried here too.
const needsDb = info.filter((p) => !p.HockeyDB && p.BirthDate && !p.ID.startsWith("P-"));

if (missing.size === 0 && needsDb.length === 0) {
  log("player_info.csv already covers every player in the stats; nothing to do.");
  process.exit(0);
}
log(`${missing.size} player(s) missing from player_info.csv: ${[...missing.keys()].join(", ")}; ${needsDb.length} row(s) lacking a HockeyDB id`);

const roster = missing.size ? await fetchNhlRosters(season) : [];
const added = [];

for (const [id, st] of missing) {
  let name, birthDate, team = st.team;
  const hit = matchHockeyRefId(id, roster);
  if (hit) {
    ({ birthDate } = hit);
    name = `${hit.first} ${hit.last}`;
    if (/^\d+TM$/.test(team)) team = hit.team; // traded mid-season: use the current club
    log(`${id}: resolved via NHL API -> ${name} (${birthDate}, ${team})`);
  } else {
    const page = await fetchHockeyRefPage(id);
    if (!page) {
      log(`${id}: could not be resolved this run; will be retried next run`);
      continue;
    }
    ({ name, birthDate } = page);
    if (/^\d+TM$/.test(team)) team = roster.find((e) => normalize(`${e.first}${e.last}`) === normalize(name))?.team ?? team;
    log(`${id}: resolved via Hockey-Reference -> ${name} (${birthDate}, ${team})`);
  }
  added.push({ ID: id, Name: name, BirthDate: birthDate, Pos: st.pos, NHL: team, HockeyDB: "", PuckPedia: puckPediaSlug(name) });
}

for (const p of [...added, ...needsDb]) {
  const dbId = await fetchHockeyDbId(p.Name, p.BirthDate);
  if (dbId) {
    p.HockeyDB = dbId;
    log(`${p.ID}: HockeyDB id ${dbId}`);
  }
}

// Append new rows / patch back-filled ids, preserving the file's existing layout
// (header, LF line endings, no trailing newline).
let text = readFileSync(infoPath, "utf-8");
for (const p of needsDb.filter((p) => p.HockeyDB)) {
  text = text.replace(new RegExp(`^(${p.ID},[^\\r\\n]*?),,`, "m"), `$1,${p.HockeyDB},`);
}
const eol = text.includes("\r\n") ? "\r\n" : "\n";
for (const p of added)
  text += `${eol}${[p.ID, p.Name, p.BirthDate, p.Pos, p.NHL, p.HockeyDB, p.PuckPedia].join(",")}`;

if (DRY_RUN) {
  log("DRY_RUN: would append:\n" + added.map((p) => Object.values(p).join(",")).join("\n"));
} else {
  writeFileSync(infoPath, text);
  log(`added ${added.length} player(s), back-filled ${needsDb.filter((p) => p.HockeyDB).length} HockeyDB id(s); ${siteRequests} site request(s) used`);
}
