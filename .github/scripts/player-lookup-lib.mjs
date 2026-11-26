// Finding one player's Hockey-Reference id and HockeyDB id, for add-player.mjs. Both sites block bots and quick access, so every
// request goes through politeGet (serial, 6-10s apart, stops at the first sign of blocking). One player needs a handful of requests.
import { hockeyRefStem } from "../../src/components/playerRules.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Returns get(url) -> {url, body} | null (null: blocked, missing or failed; the reason is logged). Spacing is configurable for tests.
export function createPoliteGet({ minDelayMs = 6000, jitterMs = 4000, maxRequests = 15, log = console.log,
  userAgent = "FHL-Dashboard-PlayerInfo/1.0 (personal fantasy hockey league dashboard; low-volume, 1 request per ~8s)" } = {}) {
  const sites = {};
  let count = 0;
  return async function politeGet(url) {
    const host = new URL(url).host;
    const site = (sites[host] ??= { blocked: false, last: 0 });
    if (site.blocked || count >= maxRequests) return null;
    const wait = site.last + minDelayMs + Math.random() * jitterMs - Date.now();
    if (wait > 0) await sleep(wait);
    count++;
    site.last = Date.now();
    let res;
    try {
      res = await fetch(url, { redirect: "follow", headers: { "User-Agent": userAgent, Accept: "text/html,application/xhtml+xml", "Accept-Language": "en" }, signal: AbortSignal.timeout(30000) });
    } catch (e) { log(`${host}: network error (${e.message})`); return null; }
    const body = await res.text();
    const challenged = /cf-browser-verification|Just a moment\.\.\.|captcha|Access Denied/i.test(body.slice(0, 4000));
    if ([403, 429, 503].includes(res.status) || challenged) { site.blocked = true; log(`${host}: ${res.status}${challenged ? " (challenge page)" : ""}; no more requests to this site`); return null; }
    if (!res.ok) { log(`${host}: HTTP ${res.status} for ${url}`); return { status: res.status, url: res.url, body: "" }; }
    return { status: res.status, url: res.url, body };
  };
}

// The Hockey-Reference id: the page for <stem>01, <stem>02... whose birth date is this player's. Pages are numbered in order, so a missing
// page means there are no more. Returns the id, or null if none matches (or the site would not answer).
export async function findHockeyRefId({ first, last, birthDate }, get, log = console.log) {
  const stem = hockeyRefStem(first, last);
  if (stem.length < 4) return null;
  for (let n = 1; n <= 6; n++) {
    const id = `${stem}${String(n).padStart(2, "0")}`;
    const res = await get(`https://www.hockey-reference.com/players/${stem[0]}/${id}.html`);
    if (!res || res.status === 404 || !res.body) { log(`Hockey-Reference: no page for ${id}`); return null; }
    const born = res.body.match(/id="necro-birth"[^>]*data-birth="(\d{4}-\d{2}-\d{2})"/)?.[1];
    if (born === birthDate) return id;
    log(`Hockey-Reference: ${id} was born ${born ?? "on an unknown date"}, not ${birthDate}`);
  }
  return null;
}

// The HockeyDB id (a unique name goes straight to the player's page; shared names are told apart by year of birth), or null.
export async function findHockeyDbId(name, birthDate, get, log = console.log) {
  const res = await get(`https://www.hockeydb.com/ihdb/stats/find_player.php?full_name=${encodeURIComponent(name)}`);
  if (!res) return null;
  const direct = res.url.match(/pdisplay\.php\?pid=(\d+)/);
  if (direct) return direct[1];
  const rows = [...res.body.matchAll(/<tr data-status='[^']*'>[\s\S]*?pdisplay\.php\?pid=(\d+)[\s\S]*?<td class='col-yob'>(\d{4})<\/td>/g)];
  const hits = rows.filter((r) => r[2] === birthDate.slice(0, 4));
  if (hits.length === 1) return hits[0][1];
  log(`HockeyDB: ${hits.length === 0 ? "no" : "ambiguous"} match for ${name} (${birthDate}); left blank`);
  return null;
}
