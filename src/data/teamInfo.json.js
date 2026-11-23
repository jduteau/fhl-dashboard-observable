import { readCsvFile, readTransactions, waiverCostsFor, getContract, computeTeamCash, seasonsConfig, seasons, allSeasons, currentSeason, loadSeasonData, mapPosition, calculateAge, indexBy, requireRow, assertPlayersKnown } from "../components/loadfiles.js";
import { PERIODS_PER_SEASON, projectedBudget } from "../components/leagueRules.js";
import { identityColumns, sortRoster, isActive } from "../components/playerRows.js";

function buildSeasonTeamInfo(sf, teamInfo, teamCash, owners, playerInfo, contracts, currentPicks, nextPicks, nextSeason) {
  const { season, rosterPeriods, availablePeriods } = sf;
  // Cash and budgets are as of the period in progress, and a period counts as in progress as soon as its roster file exists
  // (the commissioner materialized it), even though its stats have not arrived yet: the lineups are final and its cost is
  // what the teams now have to plan around. So this can be one ahead of the stats-based sf.latestPeriod.
  const latestPeriod = Math.max(sf.latestPeriod, rosterPeriods.length ? rosterPeriods[rosterPeriods.length - 1].period : 0);
  const lastPeriodNum = latestPeriod - 1;
  const playerIndex = indexBy(playerInfo, "ID");
  const cashIndex = indexBy(teamCash, "ABBR");
  const ownerIndex = indexBy(owners, "ABBR");
  assertPlayersKnown(playerIndex, rosterPeriods.map(p => ({ name: `${season} rosters_p${String(p.period).padStart(2, "0")}.csv`, rows: p.data })));
  const latestKey = String(latestPeriod); // the period in progress, as a key into team[...]
  // autoCash seasons: team_cash.csv is the starting cash and current cash is derived from the rosters
  const autoCash = seasonsConfig.find(s => s.season === season)?.autoCash === "true";
  // Waiver cuts cost cash from the period they take effect (see waiverCost in leagueRules.js)
  const waiverCosts = waiverCostsFor(readTransactions(sf.basePath), contracts, season).filter(w => w.applied);

  const teams = teamInfo.map(team => {
    const cashInfo = requireRow(cashIndex, team.ABBR, "Team", `${season} team_cash.csv`);
    team['CASH'] = autoCash ? computeTeamCash(cashInfo.CASH, team.ABBR, rosterPeriods, contracts, waiverCosts) : cashInfo.CASH;
    const ownerInfo = requireRow(ownerIndex, team.ABBR, "Team", `${season} owners.csv`);
    team['OWNER'] = ownerInfo.OWNER;
    team['LOCATION'] = ownerInfo.LOCATION;
    team['CURRENT_PICKS'] = currentPicks.filter(pick => pick.OWNER === team.ABBR).reduce((acc, pick) => acc + `${pick.PICK} `, "");
    team['NEXT_PICKS'] = nextPicks.filter(pick => pick.OWNER === team.ABBR).reduce((acc, pick) => acc + `${pick.PICK} `, "");

    // Structured pick lists (used by trade selection). PICK ids repeat across seasons (e.g. "ANA1"), so each carries its draft season.
    team['CURRENT_PICK_LIST'] = currentPicks.filter(pick => pick.OWNER === team.ABBR).map(pick => ({ PICK: pick.PICK, DraftSeason: season }));
    team['NEXT_PICK_LIST'] = nextPicks.filter(pick => pick.OWNER === team.ABBR).map(pick => ({ PICK: pick.PICK, DraftSeason: nextSeason }));

    rosterPeriods.forEach(periodInfo => {
      team[periodInfo.period] = {};
      const roster = periodInfo.data.filter(player => player.ABBR === team.ABBR);
      team[periodInfo.period]['ROSTER'] = roster.map(player => {
        const info = playerIndex.get(player.ID);
        const position = mapPosition(info.Pos);
        return {
          PLAYER_ID: player.ID,
          ...identityColumns(info, position, season, getContract(contracts, player.ID, periodInfo.period), { links: false }),
          Reserve: player.RESERVE,
        };
      });
      sortRoster(team[periodInfo.period]['ROSTER']);
      team[periodInfo.period]['TOTAL_SALARY'] = team[periodInfo.period]['ROSTER'].reduce((sum, p) => sum + (p.Salary || 0), 0);
      team[periodInfo.period]['TOTAL_COUNTS'] = team[periodInfo.period]['ROSTER']
        .reduce((counts, player) => ({
          G: counts.G + (player.Position === "G" ? 1 : 0),
          D: counts.D + (player.Position === "D" ? 1 : 0),
          F: counts.F + (player.Position !== "G" && player.Position !== "D" ? 1 : 0)
        }), { F: 0, D: 0, G: 0 });
      team[periodInfo.period]['ACTIVE_COUNTS'] = team[periodInfo.period]['ROSTER']
        .filter(isActive)
        .reduce((counts, player) => ({
          G: counts.G + (player.Position === "G" ? 1 : 0),
          D: counts.D + (player.Position === "D" ? 1 : 0),
          F: counts.F + (player.Position !== "G" && player.Position !== "D" ? 1 : 0)
        }), { F: 0, D: 0, G: 0 });
    });

    team['LatestSalary'] = team[latestKey]['TOTAL_SALARY'];
    team['SalaryPerPeriod'] = team['LatestSalary'] / PERIODS_PER_SEASON;
    team['Budget'] = projectedBudget(team.CASH, team['LatestSalary'], lastPeriodNum);
    team['AddSalary'] = latestPeriod < PERIODS_PER_SEASON - 3 ? team['Budget'] * PERIODS_PER_SEASON / (PERIODS_PER_SEASON - latestPeriod) : '---';
    team['TotalPlayerCount'] = `(${team[latestKey]['TOTAL_COUNTS'].F}-${team[latestKey]['TOTAL_COUNTS'].D}-${team[latestKey]['TOTAL_COUNTS'].G}) ${team[latestKey]['TOTAL_COUNTS'].F+team[latestKey]['TOTAL_COUNTS'].D+team[latestKey]['TOTAL_COUNTS'].G}`;
    team['ActivePlayerCount'] = `(${team[latestKey]['ACTIVE_COUNTS'].F}-${team[latestKey]['ACTIVE_COUNTS'].D}-${team[latestKey]['ACTIVE_COUNTS'].G}) ${team[latestKey]['ACTIVE_COUNTS'].F+team[latestKey]['ACTIVE_COUNTS'].D+team[latestKey]['ACTIVE_COUNTS'].G}`;

    return team;
  });

  return { teams, availablePeriods, lastPeriodNum, latestPeriod };
}

const allData = {};
for (const season of seasons) {
  const sf = await loadSeasonData(season);
  const teamInfo = await readCsvFile(`${sf.basePath}/team_info.csv`);
  const teamCash = await readCsvFile(`${sf.basePath}/team_cash.csv`);
  const owners = await readCsvFile(`${sf.basePath}/owners.csv`);
  const playerInfo = await readCsvFile(`${sf.basePath}/player_info.csv`);
  const contracts = await readCsvFile(`${sf.basePath}/contracts.csv`);
  const currentPicks = await readCsvFile(`${sf.basePath}/draft_picks.csv`);
  const nextSeasonIndex = allSeasons.indexOf(season) + 1;
  let nextPicks = [];
  if (nextSeasonIndex < allSeasons.length) {
    try {
      nextPicks = await readCsvFile(`src/data/static/${allSeasons[nextSeasonIndex]}/draft_picks.csv`);
    } catch (e) {
      nextPicks = [];
    }
  }
  allData[season] = buildSeasonTeamInfo(sf, teamInfo, teamCash, owners, playerInfo, contracts, currentPicks, nextPicks, allSeasons[nextSeasonIndex]);
}

process.stdout.write(JSON.stringify({ seasons, currentSeason, data: allData }));
