import { readCsvFile, seasons, currentSeason, loadSeasonData } from "../components/loadfiles.js";
import { buildSeasonDraftOrder } from "../components/draftHelpers.js";

const allData = {};
for (const season of seasons) {
  const sf = await loadSeasonData(season);
  const draftOrderData = await readCsvFile(`${sf.basePath}/draft_order.csv`);
  const currentPicks = await readCsvFile(`${sf.basePath}/draft_picks.csv`);
  const teamInfo = await readCsvFile(`${sf.basePath}/team_info.csv`);
  allData[season] = buildSeasonDraftOrder(draftOrderData, currentPicks, teamInfo);
}

process.stdout.write(JSON.stringify({ seasons, currentSeason, data: allData }));
