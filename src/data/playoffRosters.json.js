import { readCsvFile, seasons, currentSeason, loadSeasonData, mapPosition, calculateAge, getStatsForPeriod } from "../components/loadfiles.js";

function buildSeasonPlayoffRosters(sf, teamInfo, owners, playerInfo, contracts) {
  const { availablePlayoffRounds } = sf;
  const getOverallStats = sf.getOverallStats;
  const teams = teamInfo.map(team => team.ABBR).sort();

  const teamData = teamInfo.map(team => {
    const ownerInfo = owners.find(owner => owner.ABBR === team.ABBR);
    team['EMAIL'] = ownerInfo.EMAIL;
    team['PW'] = ownerInfo.PW;

    availablePlayoffRounds.forEach((round, index) => {
      const roundKey = `R${round.round.toString().padStart(2, '0')}`;
      team[roundKey] = {};
      const roster = round.rosterFile.filter(player => player.ABBR === team.ABBR);
      const currentStats = round.statsFile;
      const previousStats = index > 0 ? availablePlayoffRounds[index - 1].statsFile : null;

      team[roundKey]['ROSTER'] = roster.map(player => {
        const info = playerInfo.find(p => p.ID === player.ID);
        const contract = contracts.find(c => c.ID === player.ID);
        const position = mapPosition(info.Pos);
        const currentPlayerStats = currentStats.find(s => s.hockeyRef === player.ID) || {};
        const previousPlayerStats = previousStats ? previousStats.find(s => s.hockeyRef === player.ID) || {} : null;
        const playerStats = previousPlayerStats
          ? getStatsForPeriod(position, currentPlayerStats, previousPlayerStats)
          : getOverallStats(position, currentPlayerStats);
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

      team[roundKey]['ROSTER'].sort((a, b) => {
        const posOrder = { 'D': 1, 'F': 2, 'G': 3 };
        if (posOrder[a.Position] !== posOrder[b.Position]) return posOrder[a.Position] - posOrder[b.Position];
        if (a.Reserve !== b.Reserve) return (a.Reserve === "R" ? 1 : 0) - (b.Reserve === "R" ? 1 : 0);
        return a.Name.localeCompare(b.Name);
      });

      team[roundKey]['ACTIVE_TOTALS'] = team[roundKey]['ROSTER']
        .filter(player => player.Reserve !== "R" && player.Reserve !== "N/A")
        .reduce((totals, player) => ({
          goals: totals.goals + (player.Position !== "G" ? (player.Goals || 0) : 0),
          assists: totals.assists + (player.Position !== "G" ? (player.Assists || 0) : 0),
          toughness: totals.toughness + (player.Position !== "G" ? (player.Toughness || 0) : 0),
          dstat: totals.dstat + (player.Position !== "G" ? (player.DStat || 0) : 0),
          gstat: totals.gstat + (player.Position === "G" ? (player.DStat || 0) : 0)
        }), { goals: 0, assists: 0, toughness: 0, dstat: 0, gstat: 0 });

      team[roundKey]['RESERVE_TOTALS'] = team[roundKey]['ROSTER']
        .filter(player => player.Reserve === "R")
        .reduce((totals, player) => ({
          goals: totals.goals + (player.Position !== "G" ? (player.Goals || 0) : 0),
          assists: totals.assists + (player.Position !== "G" ? (player.Assists || 0) : 0),
          toughness: totals.toughness + (player.Position !== "G" ? (player.Toughness || 0) : 0),
          dstat: totals.dstat + (player.Position !== "G" ? (player.DStat || 0) : 0),
          gstat: totals.gstat + (player.Position === "G" ? (player.DStat || 0) : 0)
        }), { goals: 0, assists: 0, toughness: 0, dstat: 0, gstat: 0 });
    });

    // Build OVERALL using cumulative stats from the latest playoff round
    if (availablePlayoffRounds.length > 0) {
      const latestRound = availablePlayoffRounds[availablePlayoffRounds.length - 1];
      const overallRoster = latestRound.rosterFile.filter(player => player.ABBR === team.ABBR);
      team['OVERALL'] = {};
      team['OVERALL']['ROSTER'] = overallRoster.map(player => {
        const info = playerInfo.find(p => p.ID === player.ID);
        const contract = contracts.find(c => c.ID === player.ID);
        const position = mapPosition(info.Pos);
        const playerStats = getOverallStats(position, latestRound.statsFile.find(s => s.hockeyRef === player.ID) || {});
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
          Record: position === "G" ? `${playerStats.wins || 0}-${playerStats.losses || 0}-${playerStats.ties || 0}` : null,
          SO: position === "G" ? (playerStats.so || 0) : null,
          SA: position === "G" ? (playerStats.sa || 0) : null,
          GA: position === "G" ? (playerStats.ga || 0) : null,
          Toughness: position === "G" ? null : playerStats.toughness,
          DStat: position === "G" ? (playerStats.gstat || 0) : playerStats.dstat,
          GamesPlayed: playerStats.games_played,
        };
      });
      team['OVERALL']['ROSTER'].sort((a, b) => {
        const posOrder = { 'D': 1, 'F': 2, 'G': 3 };
        if (posOrder[a.Position] !== posOrder[b.Position]) return posOrder[a.Position] - posOrder[b.Position];
        if (a.Reserve !== b.Reserve) return (a.Reserve === "R" ? 1 : 0) - (b.Reserve === "R" ? 1 : 0);
        return a.Name.localeCompare(b.Name);
      });
      team['OVERALL']['ACTIVE_TOTALS'] = team['OVERALL']['ROSTER']
        .filter(player => player.Reserve !== "R" && player.Reserve !== "N/A")
        .reduce((totals, player) => ({
          goals: totals.goals + (player.Position !== "G" ? (player.Goals || 0) : 0),
          assists: totals.assists + (player.Position !== "G" ? (player.Assists || 0) : 0),
          toughness: totals.toughness + (player.Position !== "G" ? (player.Toughness || 0) : 0),
          dstat: totals.dstat + (player.Position !== "G" ? (player.DStat || 0) : 0),
          gstat: totals.gstat + (player.Position === "G" ? (player.DStat || 0) : 0)
        }), { goals: 0, assists: 0, toughness: 0, dstat: 0, gstat: 0 });
      team['OVERALL']['RESERVE_TOTALS'] = team['OVERALL']['ROSTER']
        .filter(player => player.Reserve === "R")
        .reduce((totals, player) => ({
          goals: totals.goals + (player.Position !== "G" ? (player.Goals || 0) : 0),
          assists: totals.assists + (player.Position !== "G" ? (player.Assists || 0) : 0),
          toughness: totals.toughness + (player.Position !== "G" ? (player.Toughness || 0) : 0),
          dstat: totals.dstat + (player.Position !== "G" ? (player.DStat || 0) : 0),
          gstat: totals.gstat + (player.Position === "G" ? (player.DStat || 0) : 0)
        }), { goals: 0, assists: 0, toughness: 0, dstat: 0, gstat: 0 });
    }

    return team;
  });

  return {
    teamData,
    teams,
    availablePeriods: availablePlayoffRounds.length > 0
      ? [...availablePlayoffRounds.map(r => `R${r.round.toString().padStart(2, '0')}`), 'OVERALL']
      : [],
    roundNames: {
      ...availablePlayoffRounds.reduce((acc, r) => {
        acc[`R${r.round.toString().padStart(2, '0')}`] = r.name;
        return acc;
      }, {}),
      ...(availablePlayoffRounds.length > 0 ? { OVERALL: 'Overall' } : {})
    }
  };
}

const allData = {};
for (const season of seasons) {
  const sf = await loadSeasonData(season);
  const teamInfo = await readCsvFile(`${sf.basePath}/team_info.csv`);
  const owners = await readCsvFile(`${sf.basePath}/owners.csv`);
  const playerInfo = await readCsvFile(`${sf.basePath}/player_info.csv`);
  const contracts = await readCsvFile(`${sf.basePath}/contracts.csv`);
  allData[season] = buildSeasonPlayoffRosters(sf, teamInfo, owners, playerInfo, contracts);
}

process.stdout.write(JSON.stringify({ seasons, currentSeason, data: allData }));

      
