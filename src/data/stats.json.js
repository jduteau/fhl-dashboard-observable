import { readCsvFile, getOverallStats, latestStatsFile, mapPosition } from "../components/loadfiles.js";

const contracts = await readCsvFile("src/data/contracts.csv");

const contractRanking = contracts.map(info => {

  const stats = latestStatsFile.find(s => s.hockeyRef === info.ID) || {};
  const position = mapPosition(stats.pos);
  const playerStats = getOverallStats(position, stats);
  return {
      Position: position,
      Salary: info.Salary || 0,
      Rating: playerStats.games_played ? playerStats.rating : 0,
    };
  });


// Extract goal distribution - count players by goal totals
const goalDistribution = {};
const assistDistribution = {};
const toughnessDistribution = {};
const dstatDistribution = {};
const gstatDistribution = {};

latestStatsFile.forEach(player => {
  if (player.pos === "G") return; // Skip goalies for skater stats
  
  // Count goals
  const goals = player["stats/goals"] || 0;
  if (goalDistribution[goals]) {
    goalDistribution[goals]++;
  } else {
    goalDistribution[goals] = 1;
  }
  
  // Count assists
  const assists = player["stats/assists"] || 0;
  if (assistDistribution[assists]) {
    assistDistribution[assists]++;
  } else {
    assistDistribution[assists] = 1;
  }
  
  // Count toughness (PIM + Hits)
  const toughness = (player["stats/pim"] || 0) + (player["stats/hits"] || 0);
  if (toughnessDistribution[toughness]) {
    toughnessDistribution[toughness]++;
  } else {
    toughnessDistribution[toughness] = 1;
  }
  
  // Calculate DStat: blocks + take - give + toi / (20 if D else 30)
  const toiDivisor = player.pos === "D" ? 20 : 30;
  const dstat = (player["stats/blocks"] || 0) + 
                (player["stats/take"] || 0) - 
                (player["stats/give"] || 0) + 
                ((player["stats/toi"] || 0) / toiDivisor);

  const roundedDstat = Math.round(dstat * 1000) / 1000;
  if (dstatDistribution[roundedDstat]) {
    dstatDistribution[roundedDstat]++;
  } else {
    dstatDistribution[roundedDstat] = 1;
  }
});

// Process goalies separately for GStat
latestStatsFile.forEach(player => {
  if (player.pos !== "G") return; // Only process goalies
  
  // Calculate GStat: 2 * wins + ties + 2 * shutouts + 0.15 * shots_against - goals_against
  const gstat = 2 * (player["stats/wins"] || 0) + 
                (player["stats/ties"] || 0) + 
                2 * (player["stats/so"] || 0) + 
                0.15 * (player["stats/sa"] || 0) - 
                (player["stats/ga"] || 0);
  
  // Round GStat to 2 decimal places for grouping
  const roundedGstat = Math.round(gstat * 100) / 100;
  if (gstatDistribution[roundedGstat]) {
    gstatDistribution[roundedGstat]++;
  } else {
    gstatDistribution[roundedGstat] = 1;
  }
});

// Convert to array format sorted by goal count
const goalRanges = Object.keys(goalDistribution)
  .map(goals => ({
    goals: parseInt(goals),
    playerCount: goalDistribution[goals]
  }))
  .sort((a, b) => a.goals - b.goals);

// Convert to array format sorted by assist count
const assistRanges = Object.keys(assistDistribution)
  .map(assists => ({
    assists: parseInt(assists),
    playerCount: assistDistribution[assists]
  }))
  .sort((a, b) => a.assists - b.assists);

// Convert to array format sorted by toughness count
const toughnessRanges = Object.keys(toughnessDistribution)
  .map(toughness => ({
    toughness: parseInt(toughness),
    playerCount: toughnessDistribution[toughness]
  }))
  .sort((a, b) => a.toughness - b.toughness);

// Convert to array format sorted by dstat value
const dstatRanges = Object.keys(dstatDistribution)
  .map(dstat => ({
    dstat: parseFloat(dstat),
    playerCount: dstatDistribution[dstat]
  }))
  .sort((a, b) => a.dstat - b.dstat);

// Convert to array format sorted by gstat value
const gstatRanges = Object.keys(gstatDistribution)
  .map(gstat => ({
    gstat: parseFloat(gstat),
    playerCount: gstatDistribution[gstat]
  }))
  .sort((a, b) => a.gstat - b.gstat);

process.stdout.write(JSON.stringify({ goalRanges, assistRanges, toughnessRanges, dstatRanges, gstatRanges, contractRanking }));
