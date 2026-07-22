import { readCsvFile, seasons, currentSeason, loadSeasonData, mapPosition, calculateAge } from "../components/loadfiles.js";

function buildSeasonTeamInfo(sf, teamInfo, teamCash, owners, playerInfo, contracts, currentPicks, nextPicks) {
  const { rosterPeriods, availablePeriods, lastPeriodNum } = sf;

  const teams = teamInfo.map(team => {
    const cashInfo = teamCash.find(cash => cash.ABBR === team.ABBR);
    team['CASH'] = cashInfo.CASH;
    const ownerInfo = owners.find(owner => owner.ABBR === team.ABBR);
    team['OWNER'] = ownerInfo.OWNER;
    team['EMAIL'] = ownerInfo.EMAIL;
    team['LOCATION'] = ownerInfo.LOCATION;
    team['CURRENT_PICKS'] = currentPicks.filter(pick => pick.OWNER === team.ABBR).reduce((acc, pick) => acc + `${pick.PICK} `, "");
    team['NEXT_PICKS'] = nextPicks.filter(pick => pick.OWNER === team.ABBR).reduce((acc, pick) => acc + `${pick.PICK} `, "");

    rosterPeriods.forEach(periodInfo => {
      team[periodInfo.period] = {};
      const roster = periodInfo.data.filter(player => player.ABBR === team.ABBR);
      team[periodInfo.period]['ROSTER'] = roster.map(player => {
        const info = playerInfo.find(p => p.ID === player.ID);
        const contract = contracts.find(c => c.ID === player.ID);
        return {
          PLAYER_ID: player.ID,
          Name: info.Name,
          BirthDate: info.BirthDate,
          Age: calculateAge(info.BirthDate),
          Position: mapPosition(info.Pos),
          NHLTeam: info.NHL,
          Salary: contract?.Salary || 0,
          Contract: contract?.Contract || '---',
          Reserve: player.RESERVE,
        };
      });
      team[periodInfo.period]['ROSTER'].sort((a, b) => {
        const posOrder = { 'G': 3, 'D': 1, 'F': 2 };
        if (posOrder[a.Position] !== posOrder[b.Position]) return posOrder[a.Position] - posOrder[b.Position];
        if (a.Reserve !== b.Reserve) return (a.Reserve === "R" ? 1 : 0) - (b.Reserve === "R" ? 1 : 0);
        return 0;
      });
      team[periodInfo.period]['TOTAL_SALARY'] = team[periodInfo.period]['ROSTER'].reduce((sum, p) => sum + (p.Salary || 0), 0);
      team[periodInfo.period]['TOTAL_COUNTS'] = team[periodInfo.period]['ROSTER']
        .reduce((counts, player) => ({
          G: counts.G + (player.Position === "G" ? 1 : 0),
          D: counts.D + (player.Position === "D" ? 1 : 0),
          F: counts.F + (player.Position !== "G" && player.Position !== "D" ? 1 : 0)
        }), { F: 0, D: 0, G: 0 });
      team[periodInfo.period]['ACTIVE_COUNTS'] = team[periodInfo.period]['ROSTER']
        .filter(player => player.Reserve !== "R" && player.Reserve !== "N/A")
        .reduce((counts, player) => ({
          G: counts.G + (player.Position === "G" ? 1 : 0),
          D: counts.D + (player.Position === "D" ? 1 : 0),
          F: counts.F + (player.Position !== "G" && player.Position !== "D" ? 1 : 0)
        }), { F: 0, D: 0, G: 0 });
    });

    team['LatestSalary'] = team[availablePeriods[lastPeriodNum]]['TOTAL_SALARY'];
    team['SalaryPerPeriod'] = team['LatestSalary'] / 25;
    team['Budget'] = team.CASH - (team['SalaryPerPeriod'] < 13 ? 13 : team['SalaryPerPeriod']) * (26 - availablePeriods.length);
    team['AddSalary'] = availablePeriods.length < 22 ? team['Budget'] * 25 / (25 - availablePeriods.length) : '---';
    team['TotalPlayerCount'] = `(${team[availablePeriods[lastPeriodNum]]['TOTAL_COUNTS'].F}-${team[availablePeriods[lastPeriodNum]]['TOTAL_COUNTS'].D}-${team[availablePeriods[lastPeriodNum]]['TOTAL_COUNTS'].G}) ${team[availablePeriods[lastPeriodNum]]['TOTAL_COUNTS'].F+team[availablePeriods[lastPeriodNum]]['TOTAL_COUNTS'].D+team[availablePeriods[lastPeriodNum]]['TOTAL_COUNTS'].G}`;
    team['ActivePlayerCount'] = `(${team[availablePeriods[lastPeriodNum]]['ACTIVE_COUNTS'].F}-${team[availablePeriods[lastPeriodNum]]['ACTIVE_COUNTS'].D}-${team[availablePeriods[lastPeriodNum]]['ACTIVE_COUNTS'].G}) ${team[availablePeriods[lastPeriodNum]]['ACTIVE_COUNTS'].F+team[availablePeriods[lastPeriodNum]]['ACTIVE_COUNTS'].D+team[availablePeriods[lastPeriodNum]]['ACTIVE_COUNTS'].G}`;

    return team;
  });

  return { teams, availablePeriods, lastPeriodNum };
}

const allData = {};
for (const season of seasons) {
  const sf = await loadSeasonData(season);
  const teamInfo = await readCsvFile(`${sf.basePath}/team_info.csv`);
  const teamCash = await readCsvFile(`${sf.basePath}/team_cash.csv`);
  const owners = await readCsvFile(`${sf.basePath}/owners.csv`);
  const playerInfo = await readCsvFile(`${sf.basePath}/player_info.csv`);
  const contracts = await readCsvFile(`${sf.basePath}/contracts.csv`);
  const currentPicks = await readCsvFile(`${sf.basePath}/current_picks.csv`);
  const nextPicks = await readCsvFile(`${sf.basePath}/next_picks.csv`);
  allData[season] = buildSeasonTeamInfo(sf, teamInfo, teamCash, owners, playerInfo, contracts, currentPicks, nextPicks);
}

process.stdout.write(JSON.stringify({ seasons, currentSeason, data: allData }));
