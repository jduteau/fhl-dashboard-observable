import { readCsvFile, latestContracts, seasons, currentSeason, loadSeasonData, mapPosition, indexBy } from "../components/loadfiles.js";

function buildSeasonStats(sf, teamInfo, players, contracts) {
  const { latestStatsIndex, latestRosterIndex, getOverallStats, distributions } = sf;
  const playerIndex = indexBy(players, "ID");

  const contractRanking = latestContracts(contracts).map(info => {
    const player = playerIndex.get(info.ID);
    if (!player) return null;
    const stats = latestStatsIndex.get(info.ID) || {};
    const roster = latestRosterIndex.get(info.ID) || {};
    const position = mapPosition(player.Pos);
    const playerStats = getOverallStats(position, stats);
    return {
      Name: player.Name || "Unknown",
      Team: roster.ABBR || "FA",
      Position: position,
      Salary: info.Salary || 0,
      Rating: playerStats.games_played ? playerStats.rating : 0,
    };
  }).filter(Boolean);

  // Build distribution ranges from season-specific distributions
  const goalRanges = distributions.goalRanges.map(e => ({ goals: e.stat, playerCount: e.playerCount }));
  const assistRanges = distributions.assistRanges.map(e => ({ assists: e.stat, playerCount: e.playerCount }));
  const toughnessRanges = distributions.toughnessRanges.map(e => ({ toughness: e.stat, playerCount: e.playerCount }));
  const dstatRanges = distributions.dstatRanges.map(e => ({ dstat: e.stat, playerCount: e.playerCount }));
  const gstatRanges = distributions.gstatRanges.map(e => ({ gstat: e.stat, playerCount: e.playerCount }));

  return {
    goalRanges, assistRanges, toughnessRanges, dstatRanges, gstatRanges,
    contractRanking,
    teams: teamInfo.map(team => team.ABBR)
  };
}

const allData = {};
for (const season of seasons) {
  const sf = await loadSeasonData(season);
  const teamInfo = await readCsvFile(`${sf.basePath}/team_info.csv`);
  const players = await readCsvFile(`${sf.basePath}/player_info.csv`);
  const contracts = await readCsvFile(`${sf.basePath}/contracts.csv`);
  allData[season] = buildSeasonStats(sf, teamInfo, players, contracts);
}

process.stdout.write(JSON.stringify({ seasons, currentSeason, data: allData }));


