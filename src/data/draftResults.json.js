import { readCsvFile, allSeasons, seasons, currentSeason, mapPosition } from "../components/loadfiles.js";
import { buildSeasonDraftOrder } from "../components/draftHelpers.js";

const allData = {};
for (const season of seasons) {
  const seasonIndex = allSeasons.indexOf(season);
  const sourceSeason = seasonIndex > 0 ? allSeasons[seasonIndex - 1] : null;

  if (sourceSeason === null) {
    allData[season] = { sourceSeason: null, results: [] };
    continue;
  }

  const draftOrderData = await readCsvFile(`src/data/static/${sourceSeason}/draft_order.csv`);
  const draftPicks = await readCsvFile(`src/data/static/${sourceSeason}/draft_picks.csv`);
  const teamInfo = await readCsvFile(`src/data/static/${season}/team_info.csv`);
  const playerInfo = await readCsvFile(`src/data/static/${season}/player_info.csv`);

  const { flat } = buildSeasonDraftOrder(draftOrderData, draftPicks, teamInfo);

  let draftResults = [];
  try {
    draftResults = await readCsvFile(`src/data/static/${season}/draft_results.csv`);
  } catch (e) {
    draftResults = [];
  }
  const playerIdMap = {};
  for (const row of draftResults) {
    playerIdMap[row.PICK] = row.PLAYERID ?? row.PLAYER_ID;
  }
  const playerInfoMap = {};
  for (const player of playerInfo) {
    playerInfoMap[player.ID] = player;
  }

  const results = flat.map(pick => {
    const playerId = playerIdMap[pick.pickLabel] || null;
    const player = playerId ? playerInfoMap[playerId] : null;
    const traded = pick.team && pick.team !== "—" && pick.team !== pick.originalTeam;
    return {
      ...pick,
      teamLabel: traded ? `${pick.originalTeam}(${pick.team})` : pick.originalTeam,
      playerId,
      player: player ? player.Name : (playerId || null),
      playerNHLTeam: player ? player.NHL : null,
      playerPosition: player ? mapPosition(player.Pos) : null
    };
  });

  allData[season] = { sourceSeason, results };
}

process.stdout.write(JSON.stringify({ seasons, currentSeason, data: allData }));
