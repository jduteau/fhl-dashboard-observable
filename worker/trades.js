// Trade proposals: propose / list / respond. Pending proposals are stored in D1 (env.DB) and are only
// ever returned to the two GMs involved (each request carries that GM's password).
//
// A trade takes effect in the NEXT period's roster (latest rosters_pNN.csv + 1). A proposal that is still
// PROPOSED when that period's roster file appears is expired. Accepting requires only the *other* GM:
// proposing counts as the proposer's approval.
import { csvParse, ghFile, gh, authenticate, HttpError } from "./lib.js";

const SEASON = /^\d{4}-\d{2}$/;
const TEAM = /^[A-Z]{2,4}$/;
const PLAYER = /^[\w.'-]{1,20}$/;
const PICK = /^[A-Z]{2,4}\d{1,2}$/;
const TRADE_ID = /^[0-9a-f-]{36}$/;
const MIN_ROSTER = 20;
const MAX_ROSTER = 36;
const MAX_ITEMS = 15; // per side
const MAX_OPEN = 20; // open outgoing proposals per team
const MAX_NOTE = 500;

const pad = (n) => String(n).padStart(2, "0");
const bad = (message) => new HttpError(400, message);
const keyOf = (i) => `${i.kind}|${i.ref}|${i.pick_season}`;
const sqlTrue = "t.status = 'ACCEPTED'";

export async function handleTrades(action, body, env) {
  if (!SEASON.test(body.season ?? "") || !TEAM.test(body.team ?? "") || typeof body.password !== "string")
    throw bad("Invalid request");
  if (!env.DB) throw new HttpError(500, "Trade database is not configured");
  const ctx = await loadContext(env, body.season); // also rejects non-current seasons before we look for their owners.csv
  const owners = await authenticate(env, body.season, body.team, body.password);
  switch (action) {
    case "propose": return propose(body, env, ctx, owners);
    case "list": return list(body, env, ctx);
    case "respond": return respond(body, env, ctx);
    default: throw new HttpError(404, "Unknown trades endpoint");
  }
}

// ---- Season / period context -------------------------------------------------------------

async function loadContext(env, season) {
  const seasons = csvParse((await ghFile(env, "src/data/static/seasons.csv")) ?? "");
  const current = seasons.find((s) => s.current === "true")?.season;
  if (season !== current) throw bad(`${season} is not the current season`);
  const dir = `src/data/static/${season}/rosters`;
  const res = await gh(env, `contents/${dir}`);
  if (!res.ok) throw new HttpError(502, "Could not read rosters");
  const periods = (await res.json()).map((f) => /^rosters_p(\d+)\.csv$/.exec(f.name)?.[1]).filter(Boolean).map(Number);
  if (!periods.length) throw new HttpError(502, "No rosters found");
  const latest = Math.max(...periods);
  const nextSeason = seasons[seasons.findIndex((s) => s.season === season) + 1]?.season;
  return { season, nextSeason, dir, latest, period: latest + 1 };
}

// Who owns what according to the latest roster file and the draft_picks files (current + next season).
async function loadOwnership(env, ctx) {
  const draftSeasons = [ctx.season, ctx.nextSeason].filter(Boolean);
  const [rosterText, ...pickTexts] = await Promise.all([
    ghFile(env, `${ctx.dir}/rosters_p${pad(ctx.latest)}.csv`),
    ...draftSeasons.map((s) => ghFile(env, `src/data/static/${s}/draft_picks.csv`)),
  ]);
  if (rosterText === null) throw new HttpError(502, "Could not read the latest roster");
  const playerOwner = new Map();
  const sizes = new Map();
  for (const r of csvParse(rosterText)) {
    playerOwner.set(r.ID, r.ABBR);
    sizes.set(r.ABBR, (sizes.get(r.ABBR) ?? 0) + 1);
  }
  const pickOwner = new Map();
  draftSeasons.forEach((s, i) => {
    if (pickTexts[i]) for (const r of csvParse(pickTexts[i])) pickOwner.set(`${s}|${r.PICK}`, r.OWNER);
  });
  return { playerOwner, pickOwner, sizes };
}

// Items of trades both GMs already accepted for this period (assets are locked; players move teams).
async function acceptedItems(env, ctx) {
  const { results } = await env.DB.prepare(
    `SELECT i.kind, i.ref, i.pick_season, i.giver, i.receiver FROM trade_items i
     JOIN trades t ON t.id = i.trade_id
     WHERE ${sqlTrue} AND t.season = ? AND t.period = ?`
  ).bind(ctx.season, ctx.period).all();
  return results;
}

// ---- Validation --------------------------------------------------------------------------

function parseSide(side, label) {
  const players = side?.players ?? [];
  const picks = side?.picks ?? [];
  if (!Array.isArray(players) || !Array.isArray(picks) || players.length + picks.length > MAX_ITEMS)
    throw bad(`Invalid ${label}`);
  if (!players.every((p) => typeof p === "string" && PLAYER.test(p))) throw bad(`Invalid players in ${label}`);
  if (!picks.every((p) => p && typeof p.pick === "string" && PICK.test(p.pick) && typeof p.season === "string" && SEASON.test(p.season)))
    throw bad(`Invalid picks in ${label}`);
  return [
    ...players.map((ref) => ({ kind: "player", ref, pick_season: "" })),
    ...picks.map((p) => ({ kind: "pick", ref: p.pick, pick_season: p.season })),
  ];
}

// Throws unless `from` really owns `give`, `to` really owns `get`, nothing is locked by another accepted
// trade, and both rosters stay within MIN_ROSTER..MAX_ROSTER players.
function validateTrade(own, accepted, from, to, give, get) {
  const locked = new Set(accepted.map(keyOf));
  const flows = [...accepted];
  for (const [giver, receiver, items] of [[from, to, give], [to, from, get]]) {
    for (const it of items) {
      if (it.kind === "player") {
        if (own.playerOwner.get(it.ref) !== giver) throw bad(`${it.ref} is not on ${giver}'s roster`);
      } else {
        const owner = own.pickOwner.get(`${it.pick_season}|${it.ref}`);
        if (owner === undefined) throw bad(`Pick ${it.ref} (${it.pick_season}) does not exist`);
        if (owner !== giver) throw bad(`${giver} does not own ${it.ref} (${it.pick_season})`);
      }
      if (locked.has(keyOf(it))) throw new HttpError(409, `${it.ref} is already part of an accepted trade for this period`);
      flows.push({ ...it, giver, receiver });
    }
  }
  const delta = new Map();
  for (const f of flows) {
    if (f.kind !== "player") continue;
    delta.set(f.giver, (delta.get(f.giver) ?? 0) - 1);
    delta.set(f.receiver, (delta.get(f.receiver) ?? 0) + 1);
  }
  for (const team of [from, to]) {
    const size = (own.sizes.get(team) ?? 0) + (delta.get(team) ?? 0);
    if (size < MIN_ROSTER || size > MAX_ROSTER)
      throw bad(`${team} would have ${size} players after this trade (must be ${MIN_ROSTER}-${MAX_ROSTER})`);
  }
}

// ---- Presentation ------------------------------------------------------------------------

// "Expired" and "applied" are derived: they depend on whether the trade's period has started.
const effectiveStatus = (t, ctx) =>
  t.period > ctx.latest ? t.status : t.status === "PROPOSED" ? "EXPIRED" : t.status === "ACCEPTED" ? "APPLIED" : t.status;

function present(t, items, ctx) {
  const side = (giver) => ({
    players: items.filter((i) => i.giver === giver && i.kind === "player").map((i) => i.ref),
    picks: items.filter((i) => i.giver === giver && i.kind === "pick").map((i) => ({ pick: i.ref, season: i.pick_season })),
  });
  return {
    id: t.id, season: t.season, period: t.period, from: t.from_team, to: t.to_team,
    status: effectiveStatus(t, ctx), note: t.note, counters: t.counters,
    createdAt: t.created_at, respondedAt: t.responded_at,
    give: side(t.from_team), // what the proposer sends
    get: side(t.to_team), // what the proposer receives
  };
}

// ---- Endpoints ---------------------------------------------------------------------------

async function list(body, env, ctx) {
  const { team, season } = body;
  const { results: trades } = await env.DB.prepare(
    `SELECT * FROM trades WHERE season = ? AND (from_team = ? OR to_team = ?) ORDER BY created_at DESC LIMIT 200`
  ).bind(season, team, team).all();
  const { results: items } = await env.DB.prepare(
    `SELECT i.* FROM trade_items i JOIN trades t ON t.id = i.trade_id
     WHERE t.season = ? AND (t.from_team = ? OR t.to_team = ?)
     ORDER BY i.kind DESC, i.pick_season, i.ref`
  ).bind(season, team, team).all();
  return { period: ctx.period, trades: trades.map((t) => present(t, items.filter((i) => i.trade_id === t.id), ctx)) };
}

async function propose(body, env, ctx, owners) {
  const from = body.team;
  const to = body.to;
  if (!TEAM.test(to ?? "") || to === from || !owners.some((o) => o.ABBR === to)) throw bad("Invalid trade partner");
  const note = body.note == null ? null : String(body.note).slice(0, MAX_NOTE).trim() || null;
  const giveItems = parseSide(body.give, "give");
  const getItems = parseSide(body.get, "get");
  if (!giveItems.length && !getItems.length) throw bad("A trade needs at least one player or pick");
  if (new Set([...giveItems, ...getItems].map(keyOf)).size !== giveItems.length + getItems.length)
    throw bad("The same player or pick appears twice");

  let countered = null;
  if (body.counters != null) {
    if (!TRADE_ID.test(body.counters)) throw bad("Invalid counter-offer reference");
    countered = await env.DB.prepare("SELECT * FROM trades WHERE id = ?").bind(body.counters).first();
    if (!countered || countered.to_team !== from || countered.from_team !== to || countered.status !== "PROPOSED" || countered.period !== ctx.period)
      throw bad("That proposal can't be countered");
  }

  const [own, accepted, open] = await Promise.all([
    loadOwnership(env, ctx),
    acceptedItems(env, ctx),
    env.DB.prepare("SELECT COUNT(*) AS n FROM trades WHERE from_team = ? AND season = ? AND period = ? AND status = 'PROPOSED'")
      .bind(from, ctx.season, ctx.period).first(),
  ]);
  if (open.n >= MAX_OPEN) throw new HttpError(429, "Too many open proposals; withdraw some first");
  validateTrade(own, accepted, from, to, giveItems, getItems);

  const now = new Date().toISOString();
  if (countered) {
    const r = await env.DB.prepare("UPDATE trades SET status = 'COUNTERED', responded_at = ? WHERE id = ? AND status = 'PROPOSED'")
      .bind(now, countered.id).run();
    if (!r.meta.changes) throw new HttpError(409, "That proposal was just changed by the other GM");
  }
  const id = crypto.randomUUID();
  const insertItem = (it, giver, receiver) =>
    env.DB.prepare("INSERT INTO trade_items (trade_id, kind, ref, pick_season, giver, receiver) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(id, it.kind, it.ref, it.pick_season, giver, receiver);
  await env.DB.batch([
    env.DB.prepare("INSERT INTO trades (id, season, period, from_team, to_team, note, counters, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(id, ctx.season, ctx.period, from, to, note, countered?.id ?? null, now),
    ...giveItems.map((it) => insertItem(it, from, to)),
    ...getItems.map((it) => insertItem(it, to, from)),
  ]);
  return { ok: true, id, period: ctx.period };
}

async function respond(body, env, ctx) {
  const { team } = body;
  if (!TRADE_ID.test(body.id ?? "")) throw bad("Invalid trade id");
  if (!["accept", "decline", "withdraw"].includes(body.decision)) throw bad("Invalid decision");
  // A trade you're not part of looks exactly like a trade that doesn't exist.
  const trade = await env.DB.prepare("SELECT * FROM trades WHERE id = ?").bind(body.id).first();
  if (!trade || (trade.from_team !== team && trade.to_team !== team)) throw new HttpError(404, "Trade not found");
  if (trade.status !== "PROPOSED") throw new HttpError(409, `This trade is already ${trade.status.toLowerCase()}`);
  if (trade.period <= ctx.latest) throw new HttpError(409, "This proposal expired when the new period started");

  const now = new Date().toISOString();
  const finish = async (status) => {
    const r = await env.DB.prepare("UPDATE trades SET status = ?, responded_at = ? WHERE id = ? AND status = 'PROPOSED'")
      .bind(status, now, trade.id).run();
    if (!r.meta.changes) throw new HttpError(409, "This trade was just changed");
    return { ok: true, status };
  };

  if (body.decision === "withdraw") {
    if (trade.from_team !== team) throw new HttpError(403, "Only the proposer can withdraw a trade");
    return finish("WITHDRAWN");
  }
  if (trade.to_team !== team) throw new HttpError(403, "Only the other GM can respond to a proposal");
  if (body.decision === "decline") return finish("DECLINED");

  // Accept: re-check everything against current data, then commit atomically.
  const { results: items } = await env.DB.prepare("SELECT * FROM trade_items WHERE trade_id = ?").bind(trade.id).all();
  const [own, accepted] = await Promise.all([loadOwnership(env, ctx), acceptedItems(env, ctx)]);
  try {
    validateTrade(own, accepted, trade.from_team, trade.to_team,
      items.filter((i) => i.giver === trade.from_team), items.filter((i) => i.giver === trade.to_team));
  } catch (e) {
    // A 409 means an asset got locked by another accepted trade; a 400 means ownership/roster size changed.
    // Either way this proposal can no longer happen as written.
    if (e instanceof HttpError) await env.DB.prepare("UPDATE trades SET status = 'VOID', responded_at = ? WHERE id = ? AND status = 'PROPOSED'").bind(now, trade.id).run();
    throw e;
  }

  // Single statement so two simultaneous accepts of trades sharing an asset can't both succeed.
  const r = await env.DB.prepare(
    `UPDATE trades SET status = 'ACCEPTED', responded_at = ?
     WHERE id = ? AND status = 'PROPOSED' AND NOT EXISTS (
       SELECT 1 FROM trade_items a
       JOIN trade_items b ON b.kind = a.kind AND b.ref = a.ref AND b.pick_season = a.pick_season AND b.trade_id <> a.trade_id
       JOIN trades t ON t.id = b.trade_id AND ${sqlTrue} AND t.period = trades.period
       WHERE a.trade_id = trades.id)`
  ).bind(now, trade.id).run();
  if (!r.meta.changes) throw new HttpError(409, "This trade conflicts with one that was just accepted");

  // Other open proposals that include any of these assets can't happen any more.
  await env.DB.prepare(
    `UPDATE trades SET status = 'VOID', responded_at = ?
     WHERE status = 'PROPOSED' AND season = ? AND period = ? AND id <> ? AND EXISTS (
       SELECT 1 FROM trade_items a JOIN trade_items b
         ON b.kind = a.kind AND b.ref = a.ref AND b.pick_season = a.pick_season AND b.trade_id = ?
       WHERE a.trade_id = trades.id)`
  ).bind(now, trade.season, trade.period, trade.id, trade.id).run();

  // Hand the (now public) trade to the repo workflow. If this fails the trade stays ACCEPTED, published = 0.
  const side = (giver) => ({
    players: items.filter((i) => i.giver === giver && i.kind === "player").map((i) => i.ref),
    picks: items.filter((i) => i.giver === giver && i.kind === "pick").map((i) => ({ pick: i.ref, season: i.pick_season })),
  });
  const dispatch = await gh(env, "dispatches", {
    method: "POST",
    body: JSON.stringify({
      event_type: "trade-approved",
      client_payload: { id: trade.id, season: trade.season, period: trade.period, from: trade.from_team, to: trade.to_team, give: side(trade.from_team), get: side(trade.to_team), acceptedAt: now },
    }),
  });
  const published = dispatch.status === 204;
  if (published) await env.DB.prepare("UPDATE trades SET published = 1 WHERE id = ?").bind(trade.id).run();
  return { ok: true, status: "ACCEPTED", published };
}
