import {csvFormat} from "d3-dsv";
import { readCsvFile, getContract, currentSeason, latestStatsIndex, latestRosterIndex, mapPosition, getOverallStats } from "../components/loadfiles.js";
import { identityColumns, statColumns } from "../components/playerRows.js";

const basePath = `src/data/static/${currentSeason}`;
const playerInfo = await readCsvFile(`${basePath}/player_info.csv`);
const contracts = await readCsvFile(`${basePath}/contracts.csv`);

const playerData = playerInfo.map(info => {
  const roster = latestRosterIndex.get(info.ID);
  const contract = getContract(contracts, info.ID);
  const position = mapPosition(info.Pos);
  const playerStats = getOverallStats(position, latestStatsIndex.get(info.ID) || {});
  return {
    PLAYER_ID: info.ID,
    FHL: roster?.ABBR || 'FA',
    ...identityColumns(info, position, currentSeason, contract, { links: false }),
    ...statColumns(position, playerStats, { goalieRecord: true, separateGStat: true }),
    Rating: playerStats.games_played ? playerStats.rating : 0,
  };
});

process.stdout.write(csvFormat(playerData));
