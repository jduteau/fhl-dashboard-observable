import { readCsvFile, playoffRounds, availablePlayoffRounds, mapPosition, calculateAge, getStatsForPeriod, getOverallStats } from "../components/loadfiles.js";

const teamInfo = await readCsvFile("src/data/static/team_info.csv");
const owners = await readCsvFile("src/data/static/owners.csv");
const playerInfo = await readCsvFile("src/data/static/player_info.csv");
const contracts = await readCsvFile("src/data/static/contracts.csv");

const teams = teamInfo.map(team => team.ABBR).sort();

const teamData = teamInfo.map(team => {
  const ownerInfo = owners.find(owner => owner.ABBR === team.ABBR);
  team['EMAIL'] = ownerInfo.EMAIL;
  team['PW'] = ownerInfo.PW;

  // Add playoff round-specific rosters
  availablePlayoffRounds.forEach((round, index) => {
    team[`R${round.round.toString().padStart(2, '0')}`] = {};
    const roster = round.rosterFile.filter(player => player.ABBR === team.ABBR);
    const currentStats = round.statsFile;
    // Get previous round stats for differential calculation (null for first round)
    const previousStats = index > 0 ? availablePlayoffRounds[index - 1].statsFile : null;
    
    team[`R${round.round.toString().padStart(2, '0')}`]['ROSTER'] = roster.map(player => {
      const info = playerInfo.find(p => p.ID === player.ID);
      const contract = contracts.find(c => c.ID === player.ID);
      const position = mapPosition(info.Pos);
      
      // Calculate round-specific stats (current round - previous round)
      const currentPlayerStats = currentStats.find(s => s.hockeyRef === player.ID) || {};
      const previousPlayerStats = previousStats ? previousStats.find(s => s.hockeyRef === player.ID) || {} : null;
      
      const playerStats = previousPlayerStats ? 
        getStatsForPeriod(position, currentPlayerStats, previousPlayerStats) : 
        getOverallStats(position, currentPlayerStats);
      
      return {
        PLAYER_ID: player.ID,
        Name: info.Name,
        BirthDate: info.BirthDate,
        Age: calculateAge(info.BirthDate),
        Position: position,
        NHLTeam: info.NHL,
        Salary: contract?.Salary || 0,
        Contract: contract?.Contract || '---',
        Reserve: player.RESERVE || "",
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
        DStat: position === "G" ? (playerStats.gstat || 0) : playerStats.dstat,
        GamesPlayed: playerStats.games_played,
      };
    });

    // Sort roster: D first, then F, then G, with non-reserves before reserves, then by name
    team[`R${round.round.toString().padStart(2, '0')}`]['ROSTER'].sort((a, b) => {
      const posOrder = { 'D': 1, 'F': 2, 'G': 3 };
      if (posOrder[a.Position] !== posOrder[b.Position]) {
        return posOrder[a.Position] - posOrder[b.Position];
      }
      if (a.Reserve !== b.Reserve) {
        return (a.Reserve === "R" ? 1 : 0) - (b.Reserve === "R" ? 1 : 0);
      }
      return a.Name.localeCompare(b.Name);
    });

    // Calculate totals for active players
    team[`R${round.round.toString().padStart(2, '0')}`]['ACTIVE_TOTALS'] = team[`R${round.round.toString().padStart(2, '0')}`]['ROSTER']
      .filter(player => player.Reserve !== "R" && player.Reserve !== "N/A")
      .reduce((totals, player) => ({
        goals: totals.goals + (player.Position !== "G" ? (player.Goals || 0) : 0),
        assists: totals.assists + (player.Position !== "G" ? (player.Assists || 0) : 0),
        toughness: totals.toughness + (player.Position !== "G" ? (player.Toughness || 0) : 0),
        dstat: totals.dstat + (player.Position !== "G" ? (player.DStat || 0) : 0),
        gstat: totals.gstat + (player.Position === "G" ? (player.DStat || 0) : 0)
      }), { goals: 0, assists: 0, toughness: 0, dstat: 0, gstat: 0 });

    // Calculate totals for reserve players  
    team[`R${round.round.toString().padStart(2, '0')}`]['RESERVE_TOTALS'] = team[`R${round.round.toString().padStart(2, '0')}`]['ROSTER']
      .filter(player => player.Reserve === "R")
      .reduce((totals, player) => ({
        goals: totals.goals + (player.Position !== "G" ? (player.Goals || 0) : 0),
        assists: totals.assists + (player.Position !== "G" ? (player.Assists || 0) : 0),
        toughness: totals.toughness + (player.Position !== "G" ? (player.Toughness || 0) : 0),
        dstat: totals.dstat + (player.Position !== "G" ? (player.DStat || 0) : 0),
        gstat: totals.gstat + (player.Position === "G" ? (player.DStat || 0) : 0)
      }), { goals: 0, assists: 0, toughness: 0, dstat: 0, gstat: 0 });
  });

  return team;
});

// Create available periods list (playoff rounds)
const availablePeriods = availablePlayoffRounds.map(round => `R${round.round.toString().padStart(2, '0')}`);

process.stdout.write(JSON.stringify({
  teams,
  teamData,
  availablePeriods,
  roundNames: availablePlayoffRounds.reduce((acc, round) => {
    acc[`R${round.round.toString().padStart(2, '0')}`] = round.name;
    return acc;
  }, {})
}));