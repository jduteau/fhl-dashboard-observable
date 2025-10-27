import {readFileSync} from "fs";
import stripBom from "strip-bom";
import {csvParse} from "d3-dsv";

const teamInfo = await csvParse(stripBom(readFileSync("src/data/team_info.csv", "utf-8")));
const teamCash = await csvParse(stripBom(readFileSync("src/data/team_cash.csv", "utf-8")), (row) => {
  return {  ABBR: row.ABBR, CASH: +row.CASH };
});
const owners = await csvParse(stripBom(readFileSync("src/data/owners.csv", "utf-8")));

const contracts = await csvParse(stripBom(readFileSync("src/data/contracts.csv", "utf-8")), (row) => {
  return { ID: row.ID, Salary: +row.Salary, Contract: row.Contract };
});
const playerInfo = await csvParse(stripBom(readFileSync("src/data/player_info.csv", "utf-8")), (row) => {
  return { ID: row.ID, Name: row.Name, BirthDate: new Date(row.BirthDate), Pos: row.Pos, NHL: row.NHL };
});

//  Load period-specific roster files (add more as files become available)
const rosterPeriods = [
  { period: 1, data: await csvParse(stripBom(readFileSync("src/data/rosters_p01.csv", "utf-8"))) },
  { period: 2, data: await csvParse(stripBom(readFileSync("src/data/rosters_p02.csv", "utf-8"))) },
  { period: 3, data: await csvParse(stripBom(readFileSync("src/data/rosters_p03.csv", "utf-8"))) },
  { period: 4, data: await csvParse(stripBom(readFileSync("src/data/rosters_p04.csv", "utf-8"))) },
  // Add more periods here as files become available:
  // { period: 4, data: await csvParse(stripBom(readFileSync("src/data/rosters_p04.csv", "utf-8"))) },
  // etc...
];

const rosterData = {};

// Populate rosterData
rosterPeriods.forEach(periodInfo => {
  rosterData[periodInfo.period] = periodInfo.data;
});

const availablePeriods = Object.keys(rosterData).map(Number).sort((a, b) => a - b);

// Function to calculate age as of September 15 of current year
function calculateAge(birthDateStr) {
  if (!birthDateStr) return "N/A";
  
  const birthDate = new Date(birthDateStr);
  const cutoffDate = new Date(2025, 8, 15); // September 15, 2025 (month is 0-indexed)
  
  let age = cutoffDate.getFullYear() - birthDate.getFullYear();
  const monthDiff = cutoffDate.getMonth() - birthDate.getMonth();
  
  if (monthDiff < 0 || (monthDiff === 0 && cutoffDate.getDate() < birthDate.getDate())) {
    age--;
  }
  
  return age;
}

// Function to map positions to G, D, or F
function mapPosition(pos) {
  if (!pos) return "F";
  const position = pos.toUpperCase();
  if (position === "G") return "G";
  if (position === "D") return "D";
  return "F"; // All other positions (C, LW, RW, F, etc.) become F
}

const teams = teamInfo.map(team => {
  const cashInfo = teamCash.find(cash => cash.ABBR === team.ABBR);
  team['CASH'] = cashInfo.CASH;
  const ownerInfo = owners.find(owner => owner.ABBR === team.ABBR);
  team['OWNER'] = ownerInfo.OWNER;
  team['EMAIL'] = ownerInfo.EMAIL;
  team['LOCATION'] = ownerInfo.LOCATION;

  // Add period-specific rosters with salaries  
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
      if (posOrder[a.Position] !== posOrder[b.Position]) {
        return posOrder[a.Position] - posOrder[b.Position];
      }
      if (a.Reserve !== b.Reserve) {
        return (a.Reserve === "R" ? 1 : 0) - (b.Reserve === "R" ? 1 : 0);
      }
      return a.GamesPlayed - b.GamesPlayed;
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

  team['LatestSalary'] = team[availablePeriods[availablePeriods.length-1]]['TOTAL_SALARY'];
  team['SalaryPerPeriod'] = team['LatestSalary'] / 25;
  team['Budget'] = team.CASH - team['SalaryPerPeriod'] * (26 - availablePeriods.length);
  team['AddSalary'] = availablePeriods.length < 22 ? team['Budget']*25 / (25 - availablePeriods.length) : '---';
  team['TotalPlayerCount'] = `(${team[availablePeriods[availablePeriods.length-1]]['TOTAL_COUNTS'].F}-${team[availablePeriods[availablePeriods.length-1]]['TOTAL_COUNTS'].D}-${team[availablePeriods[availablePeriods.length-1]]['TOTAL_COUNTS'].G}) ${team[availablePeriods[availablePeriods.length-1]]['TOTAL_COUNTS'].F+team[availablePeriods[availablePeriods.length-1]]['TOTAL_COUNTS'].D+team[availablePeriods[availablePeriods.length-1]]['TOTAL_COUNTS'].G}`;
  team['ActivePlayerCount'] = `(${team[availablePeriods[availablePeriods.length-1]]['ACTIVE_COUNTS'].F}-${team[availablePeriods[availablePeriods.length-1]]['ACTIVE_COUNTS'].D}-${team[availablePeriods[availablePeriods.length-1]]['ACTIVE_COUNTS'].G}) ${team[availablePeriods[availablePeriods.length-1]]['ACTIVE_COUNTS'].F+team[availablePeriods[availablePeriods.length-1]]['ACTIVE_COUNTS'].D+team[availablePeriods[availablePeriods.length-1]]['ACTIVE_COUNTS'].G}`;

  return team;
});

process.stdout.write(JSON.stringify({ teams, availablePeriods }));
//process.stdout.write(JSON.stringify(teamRankings));