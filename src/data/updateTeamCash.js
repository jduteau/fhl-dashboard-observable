import {csvFormat} from "d3-dsv";
import {readCsvFile, latestRosterFile } from "../components/loadfiles.js";

const teamCash = await readCsvFile("src/data/team_cash.csv");
const contracts = await readCsvFile("src/data/contracts.csv");

const teams = teamCash.map(team => {
  const teamData = {
    ABBR: team.ABBR,
    CASH: team.CASH,
  };

  // Load the latest roster data
  const totalSalary = latestRosterFile.filter(player => player.ABBR === team.ABBR).reduce((sum, player) => {
    const contract = contracts.find(c => c.ID === player.ID);
    return sum + (contract?.Salary || 0);
  }, 0);

  teamData.CASH = Math.round((teamData.CASH - (totalSalary < 325 ? 13 : totalSalary / 25)) * 100) / 100;

  return teamData;
});

process.stdout.write(csvFormat(teams));