import { readCsvFile, statsData, rosterPeriods, availablePeriods, mapPosition, calculateAge, getStatsForPeriod, latestStatsFile, getOverallStats } from "../components/loadfiles.js";

const teamInfo = await readCsvFile("src/data/team_info.csv");
const playerInfo = await readCsvFile("src/data/player_info.csv");
const contracts = await readCsvFile("src/data/contracts.csv");

const teams = teamInfo.map(team=>team.ABBR).sort();

const lastPeriodNum = availablePeriods.length-1;

const teamData = teamInfo.map(team => {

  team["OVERALL"] = {};
  const roster = rosterPeriods[lastPeriodNum].data.filter(player => player.ABBR === team.ABBR);
  team["OVERALL"]['ROSTER'] = roster.map(player => {
    const info = playerInfo.find(p => p.ID === player.ID);
    const contract = contracts.find(c => c.ID === player.ID);
    const position = mapPosition(info.Pos);
    const playerStats = getOverallStats(position, latestStatsFile.find(s => s.hockeyRef === player.ID) || {}); 
    return {
      PLAYER_ID: player.ID,
      Name: info.Name,
      BirthDate: info.BirthDate,
      Age: calculateAge(info.BirthDate),
      Position: position,
      NHLTeam: info.NHL,
      Salary: contract?.Salary || 0,
      Contract: contract?.Contract || '---',
      Reserve: "",
      Goals: position === "G" ? null : playerStats.goals,
      Assists: position === "G" ? null : playerStats.assists,
      PIM: position === "G" ? null : playerStats.pim,
      Hits: position === "G" ? null : playerStats.hits,
      Blocks: position === "G" ? null : playerStats.blocks,
      Take: position === "G" ? null : playerStats.take,
      Give: position === "G" ? null : playerStats.give,
      TOI: position === "G" ? null : playerStats.toi,
      Record: position === "G" ? playerStats.wins !== null ? `${playerStats.wins}-${playerStats.losses}-${playerStats.ties}` : '0-0-0' : null,
      SO: position === "G" ? (playerStats.so || 0) : null,
      SA: position === "G" ? (playerStats.sa || 0) : null,
      GA: position === "G" ? (playerStats.ga || 0) : null,
      Toughness: position === "G" ? null : playerStats.toughness,
      DStat: position === "G" ? null : playerStats.dstat,
      GStat: position === "G" ? (playerStats.gstat || 0) : null,
      GamesPlayed: playerStats.games_played,
      Rating: playerStats.games_played ? playerStats.rating : 0,
    };
  });
  team["OVERALL"]['ROSTER'].sort((a, b) => {
      const posOrder = { 'G': 3, 'D': 1, 'F': 2 };
      if (posOrder[a.Position] !== posOrder[b.Position]) {
        return posOrder[a.Position] - posOrder[b.Position];
      }
      if (a.Reserve !== b.Reserve) {
        return (a.Reserve === "R" ? 1 : 0) - (b.Reserve === "R" ? 1 : 0);
      }
      return b.Rating - a.Rating;
    });

  team["OVERALL"]['ACTIVE_TOTALS'] = team["OVERALL"]['ROSTER']
    .filter(player => player.Reserve !== "R" && player.Reserve !== "N/A")
    .reduce((totals, player) => ({
      goals: totals.goals + (player.Position !== "G" ? (player.Goals || 0) : 0),
      assists: totals.assists + (player.Position !== "G" ? (player.Assists || 0) : 0),
      toughness: totals.toughness + (player.Position !== "G" ? (player.Toughness || 0) : 0),
      dstat: totals.dstat + (player.DStat || 0),
      gstat: totals.gstat + (player.GStat !== null ? player.GStat : 0)
    }), { goals: 0, assists: 0, toughness: 0, dstat: 0, gstat: 0 });

  team["OVERALL"]['RESERVE_TOTALS'] = { goals: 0, assists: 0, toughness: 0, dstat: 0, gstat: 0 };

  // Add period-specific rosters with salaries  
  rosterPeriods.forEach(periodInfo => {
    team[periodInfo.period] = {};
    const roster = periodInfo.data.filter(player => player.ABBR === team.ABBR);
    const currentStats = statsData[periodInfo.period];
    const previousStats = (periodInfo.period > 1) ? statsData[periodInfo.period - 1] : [];
    const overallTeamStats = team["OVERALL"]['ROSTER'];
    team[periodInfo.period]['ROSTER'] = roster.map(player => {
      const info = playerInfo.find(p => p.ID === player.ID);
      const contract = contracts.find(c => c.ID === player.ID);
      const position = mapPosition(info.Pos);
      const playerStats = getStatsForPeriod(position, currentStats.find(s => s.hockeyRef === player.ID) || {}, previousStats.find(s => s.hockeyRef === player.ID) || {});
      const rating = overallTeamStats.find(p => p.PLAYER_ID === player.ID)?.Rating || 0;
      return {
        PLAYER_ID: player.ID,
        Name: info.Name,
        BirthDate: info.BirthDate,
        Age: calculateAge(info.BirthDate),
        Position: position,
        NHLTeam: info.NHL,
        Salary: contract?.Salary || 0,
        Contract: contract?.Contract || '---',
        Reserve: player.RESERVE,
        Goals: position === "G" ? null : playerStats.goals,
        Assists: position === "G" ? null : playerStats.assists,
        PIM: position === "G" ? null : playerStats.pim,
        Hits: position === "G" ? null : playerStats.hits,
        Blocks: position === "G" ? null : playerStats.blocks,
        Take: position === "G" ? null : playerStats.take,
        Give: position === "G" ? null : playerStats.give,
        TOI: position === "G" ? null : playerStats.toi,
        Record: position === "G" ? playerStats.wins !== null ? `${playerStats.wins}-${playerStats.losses}-${playerStats.ties}` : '0-0-0' : null,
        SO: position === "G" ? (playerStats.so || 0) : null,
        SA: position === "G" ? (playerStats.sa || 0) : null,
        GA: position === "G" ? (playerStats.ga || 0) : null,
        Toughness: position === "G" ? null : playerStats.toughness,
        DStat: position === "G" ? null : playerStats.dstat,
        GStat: position === "G" ? (playerStats.gstat || 0) : null,
        GamesPlayed: playerStats.games_played,
        Rating: rating,
      };
    });

    team[periodInfo.period]['ROSTER'].sort((a, b) => {
      const posOrder = { 'G': 3, 'D': 1, 'F': 2 };
      if (posOrder[a.Position] !== posOrder[b.Position]) {
        return posOrder[a.Position] - posOrder[b.Position];
      }
      if (a.Reserve !== b.Reserve) {
        return (a.Reserve === "R" ? 1 : 0) - (b.Reserve === "R" ? 1 : 0);
      }
      return b.Rating - a.Rating;
    });

    team[periodInfo.period]['ACTIVE_TOTALS'] = team[periodInfo.period]['ROSTER']
      .filter(player => player.Reserve !== "R" && player.Reserve !== "N/A")
      .reduce((totals, player) => ({
        goals: totals.goals + (player.Position !== "G" ? (player.Goals || 0) : 0),
        assists: totals.assists + (player.Position !== "G" ? (player.Assists || 0) : 0),
        toughness: totals.toughness + (player.Position !== "G" ? (player.Toughness || 0) : 0),
        dstat: totals.dstat + (player.DStat || 0),
        gstat: totals.gstat + (player.GStat !== null ? player.GStat : 0)
      }), { goals: 0, assists: 0, toughness: 0, dstat: 0, gstat: 0 });

    team[periodInfo.period]['RESERVE_TOTALS'] = team[periodInfo.period]['ROSTER']
      .filter(player => player.Reserve === "R")
      .reduce((totals, player) => ({
        goals: totals.goals + (player.Position !== "G" ? (player.Goals || 0) : 0),
        assists: totals.assists + (player.Position !== "G" ? (player.Assists || 0) : 0),
        toughness: totals.toughness + (player.Position !== "G" ? (player.Toughness || 0) : 0),
        dstat: totals.dstat + (player.DStat || 0),
        gstat: totals.gstat + (player.GStat !== null ? player.GStat : 0)
      }), { goals: 0, assists: 0, toughness: 0, dstat: 0, gstat: 0 });

  });

  return team;
});

process.stdout.write(JSON.stringify({ teamData, teams, availablePeriods: [...availablePeriods, "OVERALL"] }));
//process.stdout.write(JSON.stringify(teamData[0]));