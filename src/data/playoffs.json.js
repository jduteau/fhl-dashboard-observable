import { readCsvFile, seasons, currentSeason, loadSeasonData } from "../components/loadfiles.js";
import { buildSeasonPlayoffs } from "../components/playoffHelpers.js";

const allData = {};
for (const season of seasons) {
  const sf = await loadSeasonData(season);
  const teamInfo = await readCsvFile(`${sf.basePath}/team_info.csv`);
  const bracketConfig = await readCsvFile(`${sf.basePath}/playoff_bracket.csv`);
  allData[season] = buildSeasonPlayoffs(sf, teamInfo, bracketConfig);
}

process.stdout.write(JSON.stringify({ seasons, currentSeason, data: allData }));

