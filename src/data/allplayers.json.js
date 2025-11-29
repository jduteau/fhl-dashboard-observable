import { readCsvFile, latestStatsFile, statsPeriods, statsData, latestRosterFile, mapPosition, calculateAge, availablePeriods, getStatsForPeriod, getOverallStats } from "../components/loadfiles.js";

const teamInfo = await readCsvFile("src/data/team_info.csv");
const playerInfo = await readCsvFile("src/data/player_info.csv");
const contracts = await readCsvFile("src/data/contracts.csv");
const drafted = await readCsvFile("src/data/drafted_players.csv");

const teams = ["All",...teamInfo.map(team=>team.ABBR).sort(), "FA"];

const playerData = playerInfo.map(info => {
  let player = {};
  const roster = latestRosterFile.find(player => player.ID === info.ID);
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
    DStat: position === "G" ? null : playerStats.dstat,
    GStat: position === "G" ? (playerStats.gstat || 0) : null,
    GamesPlayed: playerStats.games_played,
    Rating: overallRating
  };
  // Add period-specific stats
  statsPeriods.forEach(periodInfo => {
    player[periodInfo.period] = {};
    const currentStats = statsData[periodInfo.period];
    const previousStats = (periodInfo.period > 1) ? statsData[periodInfo.period - 1] : [];
    const playerStats = getStatsForPeriod(position, currentStats.find(s => s.hockeyRef === info.ID) || {}, previousStats.find(s => s.hockeyRef === info.ID) || {});
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
      DStat: position === "G" ? null : playerStats.dstat,
      GStat: position === "G" ? (playerStats.gstat || 0) : null,
      GamesPlayed: playerStats.games_played,
      Rating: overallRating,
    };
  });
  return player;
});

process.stdout.write(JSON.stringify({ playerData, teams, availablePeriods: [...availablePeriods, "OVERALL"] }));
//process.stdout.write(JSON.stringify(playerData.map(p => p["2"])));