// The commissioner (ADMIN_PASSWORD) adds a player to player_info.csv, for someone the daily stats download has not picked up
// yet. He types a name (and a birth date only if two players share it).
//
//   POST /players/add  {password, season, name, birthDate?}
//
// The Worker finds the player on the NHL's API (birth date, position, team), checks he is not listed already, and sends ONE
// `add-player` repository_dispatch (Add Player workflow). The workflow finds the Hockey-Reference and HockeyDB ids (those sites
// block quick or scripted access, so it is slow and polite) and appends the row. Looking up the NHL part here means a name that
// matches nobody, or two people, is reported to the commissioner at once, not in a workflow log.
import { csvParse, ghFile, gh, HttpError } from "./lib.js";
import { assertAdmin } from "./accounts.js";
import { SEASON } from "../src/components/tradeRules.js";
import { cleanNewPlayer, lookupNhlPlayer, isDuplicatePlayer } from "../src/components/playerRules.js";

const bad = (message) => new HttpError(400, message);

async function fetchJson(url) {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`The NHL lookup failed (HTTP ${res.status}); try again later`);
  return res.json();
}

export async function handlePlayers(action, body, env, client) {
  if (action !== "add") throw new HttpError(404, "Unknown players endpoint");
  if (!SEASON.test(body.season ?? "") || typeof body.password !== "string" || typeof body.name !== "string") throw bad("Invalid request");
  if (body.birthDate != null && body.birthDate !== "" && !/^\d{4}-\d{2}-\d{2}$/.test(body.birthDate)) throw bad("Enter the birth date as YYYY-MM-DD");
  await assertAdmin(env, body.password, client);

  const seasons = csvParse((await ghFile(env, "src/data/static/seasons.csv")) ?? "");
  if (seasons.find((s) => s.current === "true")?.season !== body.season) throw new HttpError(409, `${body.season} is not the current season`);
  const infoText = await ghFile(env, `src/data/static/${body.season}/player_info.csv`);
  if (infoText === null) throw new HttpError(502, "Could not read player_info.csv");
  const info = csvParse(infoText);

  let found, player;
  try {
    found = await lookupNhlPlayer(body.name, fetchJson, body.birthDate || undefined);
    player = cleanNewPlayer(found, new Set(info.map((p) => p.NHL)));
  } catch (e) { throw bad(e.message); }
  if (isDuplicatePlayer(info, player)) throw new HttpError(409, `${player.Name} (born ${player.BirthDate}) is already in player_info.csv`);

  const dispatch = await gh(env, "dispatches", {
    method: "POST",
    body: JSON.stringify({ event_type: "add-player", client_payload: { season: body.season, player: { ...player, first: found.first, last: found.last } } }),
  });
  if (dispatch.status !== 204) throw new HttpError(502, "Could not add the player");
  return { ok: true, name: player.Name, birthDate: player.BirthDate, pos: player.Pos, nhl: player.NHL };
}
