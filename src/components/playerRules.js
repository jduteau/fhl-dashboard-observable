// Adding a player to player_info.csv by hand (commissioner). The commissioner only types a name; the Worker finds the
// birth date, position and NHL team on the NHL's API (lookupNhlPlayer) and the Add Player workflow finds the Hockey-Reference
// and HockeyDB ids. Shared by the Worker and the workflow script, so it has no dependencies and takes `fetchJson` as a
// parameter.

export const NEW_PLAYER_POSITIONS = ["C", "LW", "RW", "D", "G"];
export const NO_NHL_TEAM = "---"; // a prospect or free agent not on an NHL roster

const strip = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
const letters = (s) => strip(s).toLowerCase().replace(/[^a-z]/g, "");

// PuckPedia slug: "Marc Del Gaizo" -> "marc-del-gaizo" (not always exact; fix by hand in the CSV).
export const puckPediaSlug = (name) =>
  strip(name).toLowerCase().replace(/['’.]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// Hockey-Reference ids are the first five letters of the last name and the first two of the first name, then a counter
// (01, 02... for players who share them): "Connor Bedard" -> "bedarco" (-> bedarco01).
export const hockeyRefStem = (first, last) => `${letters(last).slice(0, 5)}${letters(first).slice(0, 2)}`;

// The NHL's codes where the data (which follows Hockey-Reference) spells them differently
const TEAM_CODE = { VGK: "VEG" };
const POSITION = { C: "C", L: "LW", R: "RW", D: "D", G: "G" };

// Finds the NHL player with this name. `fetchJson(url)` returns parsed JSON (and throws on an HTTP error). A birth date,
// when given, picks between players who share a name. Returns {first, last, name, birthDate, pos, nhl}; throws an Error
// whose message is fit to show the commissioner (no match, or several: it lists them).
export async function lookupNhlPlayer(name, fetchJson, birthDate) {
  const wanted = letters(name);
  if (!wanted || !/\s/.test(name.trim())) throw new Error("Enter the player's full name (first and last)");
  const hits = (await fetchJson(`https://search.d3.nhle.com/api/v1/search/player?culture=en-us&limit=25&q=${encodeURIComponent(name.trim())}`))
    .filter((h) => letters(h.name ?? "") === wanted);
  const found = [];
  for (const h of hits.slice(0, 6)) {
    const p = await fetchJson(`https://api-web.nhle.com/v1/player/${encodeURIComponent(h.playerId)}/landing`);
    const pos = POSITION[p.position];
    if (!pos || !/^\d{4}-\d{2}-\d{2}$/.test(p.birthDate ?? "")) continue;
    const team = p.currentTeamAbbrev ?? h.teamAbbrev ?? NO_NHL_TEAM;
    found.push({
      first: p.firstName?.default ?? "", last: p.lastName?.default ?? "", birthDate: p.birthDate, pos,
      nhl: TEAM_CODE[team] ?? team,
    });
  }
  const matches = birthDate ? found.filter((f) => f.birthDate === birthDate) : found;
  if (matches.length === 0)
    throw new Error(found.length ? `No ${name.trim()} was born on ${birthDate}; the NHL has ${found.map((f) => f.birthDate).join(", ")}` : `The NHL has no player named ${name.trim()}`);
  if (matches.length > 1)
    throw new Error(`Several players are named ${name.trim()}: ${matches.map((f) => `born ${f.birthDate} (${f.pos}, ${f.nhl})`).join("; ")}. Enter the birth date to pick one`);
  const m = matches[0];
  return { ...m, name: `${m.first} ${m.last}` };
}

// Validates what the lookup found and returns the player_info.csv row so far (no ID, no HockeyDB id). `nhlTeams` is the set of NHL
// team codes already in use in player_info.csv, so an unexpected code cannot create a new "team". Throws an Error naming the problem.
export function cleanNewPlayer(raw, nhlTeams) {
  const name = typeof raw?.name === "string" ? raw.name.replace(/\s+/g, " ").trim() : "";
  if (name.length < 3 || name.length > 60 || !name.includes(" ") || /[",\r\n]/.test(name)) throw new Error("Enter the player's full name (first and last)");
  const birthDate = raw?.birthDate;
  if (typeof birthDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(birthDate) || new Date(birthDate).toISOString().slice(0, 10) !== birthDate)
    throw new Error("The birth date must be YYYY-MM-DD");
  if (birthDate < "1960-01-01" || birthDate > new Date().toISOString().slice(0, 10)) throw new Error("That birth date is not plausible");
  if (!NEW_PLAYER_POSITIONS.includes(raw?.pos)) throw new Error(`Position must be one of ${NEW_PLAYER_POSITIONS.join(", ")}`);
  const nhl = raw?.nhl ?? NO_NHL_TEAM;
  if (nhl !== NO_NHL_TEAM && !nhlTeams.has(nhl)) throw new Error(`Unknown NHL team ${nhl}`);
  return { Name: name, BirthDate: birthDate, Pos: raw.pos, NHL: nhl, HockeyDB: "", PuckPedia: puckPediaSlug(name) };
}

// The same person is already listed (same name and birth date): adding him again would only create a duplicate.
export const isDuplicatePlayer = (info, p) =>
  info.some((r) => strip(r.Name).toLowerCase() === strip(p.Name).toLowerCase() && r.BirthDate === p.BirthDate);
