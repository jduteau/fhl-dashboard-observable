import { readCsvFile, seasons, currentSeason, loadSeasonData } from "../components/loadfiles.js";
import { buildSeasonStandings } from "../components/standingsHelpers.js";

const allData = {};
for (const season of seasons) {
  const sf = await loadSeasonData(season);
  const teamInfo = await readCsvFile(`${sf.basePath}/team_info.csv`);
  const playerInfo = await readCsvFile(`${sf.basePath}/player_info.csv`);
  allData[season] = buildSeasonStandings(sf, teamInfo, playerInfo);
}

process.stdout.write(JSON.stringify({ seasons, currentSeason, data: allData }));
