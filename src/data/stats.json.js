import {readFileSync} from "fs";
import stripBom from "strip-bom";
import {csvParse} from "d3-dsv";

function readStatsFile(fileName) {
  return csvParse(stripBom(readFileSync(fileName, "utf-8")), (row) => {
    // Convert numeric fields
    const numericFields = ["stats/gp", "stats/goals", "stats/assists", "stats/pim", "stats/hits", "stats/toi", "stats/blocks", "stats/take", "stats/give", "stats/wins", "stats/ties", "stats/so", "stats/sa", "stats/ga"];
    numericFields.forEach(field => {
      row[field] = row[field] ? +row[field] : 0;
    });
    return row;
  });
}

// Only include FileAttachment calls for files that actually exist
const stats = await readStatsFile("src/data/stats_p03.csv");

// Extract goal distribution - count players by goal totals
const goalDistribution = {};
const assistDistribution = {};
const toughnessDistribution = {};
const dstatDistribution = {};

stats.forEach(player => {
  if (player.position === "G") return; // Skip goalies
  
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
  
  // Round DStat to 2 decimal places for grouping
  const roundedDstat = Math.round(dstat * 100) / 100;
  if (dstatDistribution[roundedDstat]) {
    dstatDistribution[roundedDstat]++;
  } else {
    dstatDistribution[roundedDstat] = 1;
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

process.stdout.write(JSON.stringify({ goalRanges, assistRanges, toughnessRanges, dstatRanges }));
