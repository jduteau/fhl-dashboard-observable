import { readCsvFile, seasons, currentSeason, loadSeasonData, mapPosition, calculateAge, getStatsForPeriod } from "../components/loadfiles.js";

function buildSeasonAllPlayers(sf, teamInfo, playerInfo, contracts, drafted) {
  const { latestStatsFile, latestRosterFile, statsPeriods, statsData, availablePeriods, getOverallStats } = sf;
  const teams = ["All", ...teamInfo.map(team => team.ABBR).sort(), "FA"];

  const playerData = playerInfo.map(info => {
    let player = {};
    const roster = latestRosterFile.find(p => p.ID === info.ID);
    const contract = contracts.find(c => c.ID === info.ID);
    const position = mapPosition(info.Pos);
    const playerStats = getOverallStats(position, latestStatsFile.find(s => s.hockeyRef === info.ID) || {});
    const overallRating = playerStats.games_played ? playerStats.rating : 0;
    player.OVERALL = {
      PLAYER_ID: info.ID,
      FHL: roster?.ABBR || 'FA',
      Drafted: drafted.find(d => d.fhl === info.Name) ? true : false,
      Name: info.Name,
      BirthDate: info.BirthDate,
      Age: calculateAge(info.BirthDate),
      Position: position,
      NHLTeam: info.NHL,
      Salary: contract?.Salary || 0,
      Contract: contract?.Contract || '---',
      Goals: position === "G" ? null : playerStats.goals,
      Assists: position === "G" ? null : playerStats.assists,
      PIM: position === "G" ? null : playerStats.pim,
      Hits: position === "G" ? null : playerStats.hits,
      Blocks: position === "G" ? null : playerStats.blocks,
      Take: position === "G" ? null : playerStats.take,
      Give: position === "G" ? null : playerStats.give,
      TOI: position === "G" ? null : playerStats.toi,
      Wins: position === "G" ? (playerStats.wins || 0) : null,
      Losses: position === "G" ? (playerStats.losses || 0) : null,
      Ties: position === "G" ? (playerStats.ties || 0) : null,
      Record: position === "G" ? playerStats.wins !== null ? `${playerStats.wins}-${playerStats.losses}-${playerStats.ties}` : '0-0-0' : null,
      SO: position === "G" ? (playerStats.so || 0) : null,
      SA: position === "G" ? (playerStats.sa || 0) : null,
      GA: position === "G" ? (playerStats.ga || 0) : null,
      Toughness: position === "G" ? null : playerStats.toughness,
      DStat: position === "G" ? (playerStats.gstat || 0) : playerStats.dstat,
      GamesPlayed: playerStats.games_played,
      Rating: overallRating
    };
    statsPeriods.forEach(periodInfo => {
      const currentStats = statsData[periodInfo.period];
      const previousStats = (periodInfo.period > 1) ? statsData[periodInfo.period - 1] : [];
      const periodPlayerStats = getStatsForPeriod(position, currentStats.find(s => s.hockeyRef === info.ID) || {}, previousStats.find(s => s.hockeyRef === info.ID) || {});
      player[periodInfo.period] = {
        PLAYER_ID: info.ID,
        FHL: roster?.ABBR || 'FA',
        Drafted: drafted.find(d => d.fhl === info.Name) ? true : false,
        Name: info.Name,
        BirthDate: info.BirthDate,
        Age: calculateAge(info.BirthDate),
        Position: position,
        NHLTeam: info.NHL,
        Salary: contract?.Salary || 0,
        Contract: contract?.Contract || '---',
        Goals: position === "G" ? null : periodPlayerStats.goals,
        Assists: position === "G" ? null : periodPlayerStats.assists,
        PIM: position === "G" ? null : periodPlayerStats.pim,
        Hits: position === "G" ? null : periodPlayerStats.hits,
        Blocks: position === "G" ? null : periodPlayerStats.blocks,
        Take: position === "G" ? null : periodPlayerStats.take,
        Give: position === "G" ? null : periodPlayerStats.give,
        TOI: position === "G" ? null : periodPlayerStats.toi,
        Wins: position === "G" ? (periodPlayerStats.wins || 0) : null,
        Losses: position === "G" ? (periodPlayerStats.losses || 0) : null,
        Ties: position === "G" ? (periodPlayerStats.ties || 0) : null,
        Record: position === "G" ? periodPlayerStats.wins !== null ? `${periodPlayerStats.wins}-${periodPlayerStats.losses}-${periodPlayerStats.ties}` : '0-0-0' : null,
        SO: position === "G" ? (periodPlayerStats.so || 0) : null,
        SA: position === "G" ? (periodPlayerStats.sa || 0) : null,
        GA: position === "G" ? (periodPlayerStats.ga || 0) : null,
        Toughness: position === "G" ? null : periodPlayerStats.toughness,
        DStat: position === "G" ? (periodPlayerStats.gstat || 0) : periodPlayerStats.dstat,
        GamesPlayed: periodPlayerStats.games_played,
        Rating: overallRating,
      };
    });
    return player;
  });

  return { playerData, teams, availablePeriods: [...availablePeriods, "OVERALL"] };
}

const allData = {};
for (const season of seasons) {
  const sf = await loadSeasonData(season);
  const teamInfo = await readCsvFile(`${sf.basePath}/team_info.csv`);
  const playerInfo = await readCsvFile(`${sf.basePath}/player_info.csv`);
  const contracts = await readCsvFile(`${sf.basePath}/contracts.csv`);
  const drafted = await readCsvFile(`${sf.basePath}/drafted_players.csv`);
  allData[season] = buildSeasonAllPlayers(sf, teamInfo, playerInfo, contracts, drafted);
}

process.stdout.write(JSON.stringify({ seasons, currentSeason, data: allData }));

//process.stdout.write(JSON.stringify(playerData.map(p => p["2"])));