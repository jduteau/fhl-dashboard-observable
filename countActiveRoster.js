#!/usr/bin/env node

import {readFileSync} from "fs";
import stripBom from "strip-bom";
import {csvParse} from "d3-dsv";
import path from "path";

// Function to validate team roster legality
function validateTeamRoster(teamData, totalPlayers, isPlayoffRoster) {
  const issues = [];
  
  // Rules that apply to all rosters (regular season and playoff)
  if (totalPlayers > 20) {
    issues.push(`Too many players (${totalPlayers}/20 max)`);
  }
  if (teamData.goalies > 2) {
    issues.push(`Too many goalies (${teamData.goalies}/2 max)`);
  }
  if (teamData.defensemen > 7) {
    issues.push(`Too many defensemen (${teamData.defensemen}/7 max)`);
  }
  
  // Rules that only apply to regular season rosters
  if (!isPlayoffRoster) {
    if (totalPlayers < 20) {
      issues.push(`Too few players (${totalPlayers}/20 required)`);
    }
    if (teamData.defensemen < 6) {
      issues.push(`Too few defensemen (${teamData.defensemen}/6 min)`);
    }
    if (teamData.goalies < 2) {
      issues.push(`Too few goalies (${teamData.goalies}/2 min)`);
    }
  }
  
  return issues;
}

// Function to map positions to G, D, or F (copied from loadfiles.js)
function mapPosition(pos) {
  if (!pos) return "F";
  const position = pos.toUpperCase();
  if (position === "G") return "G";
  if (position === "D") return "D";
  return "F"; // All other positions (C, LW, RW, F, etc.) become F
}

// Function to read CSV files
function readCsvFile(fileName) {
  return csvParse(stripBom(readFileSync(fileName, "utf-8")));
}

// Main function to count active roster positions
function countActiveRoster(rosterFile) {
  try {
    // Read the roster file
    const rosterPath = path.resolve(rosterFile);
    const roster = readCsvFile(rosterPath);
    
    // Detect if this is a playoff roster (check filename)
    const isPlayoffRoster = rosterPath.includes('playoff') || (roster.length > 0 && roster[0].hasOwnProperty('NHL'));
    
    // Read player info for position lookup
    const playerInfoPath = path.resolve("src/data/static/player_info.csv");
    const playerInfo = readCsvFile(playerInfoPath);
    
    // Create a lookup map for player positions
    const positionLookup = {};
    playerInfo.forEach(player => {
      positionLookup[player.ID] = player.Pos;
    });
    
    // Filter for active players (those without "R" in RESERVE column)
    const activePlayers = roster.filter(player => player.RESERVE !== "R");
    
    // Count positions
    const counts = {
      forwards: 0,
      defensemen: 0,
      goalies: 0,
      unknown: 0
    };
    
    const teamCounts = {};
    const rosterViolations = {};
    
    activePlayers.forEach(player => {
      const position = positionLookup[player.ID];
      const mappedPosition = mapPosition(position);
      const team = player.ABBR;
      
      // Initialize team count if not exists
      if (!teamCounts[team]) {
        teamCounts[team] = { forwards: 0, defensemen: 0, goalies: 0, unknown: 0 };
      }
      
      // Count overall and by team
      switch (mappedPosition) {
        case "F":
          counts.forwards++;
          teamCounts[team].forwards++;
          break;
        case "D":
          counts.defensemen++;
          teamCounts[team].defensemen++;
          break;
        case "G":
          counts.goalies++;
          teamCounts[team].goalies++;
          break;
        default:
          counts.unknown++;
          teamCounts[team].unknown++;
          break;
      }
    });
    
    // Validate each team's roster
    Object.keys(teamCounts).forEach(team => {
      const teamData = teamCounts[team];
      const totalPlayers = teamData.forwards + teamData.defensemen + teamData.goalies + teamData.unknown;
      const violations = validateTeamRoster(teamData, totalPlayers, isPlayoffRoster);
      if (violations.length > 0) {
        rosterViolations[team] = violations;
      }
    });
    
    return {
      file: rosterFile,
      isPlayoffRoster: isPlayoffRoster,
      totalActivePlayers: activePlayers.length,
      totalReservePlayers: roster.length - activePlayers.length,
      totalPlayers: roster.length,
      overallCounts: counts,
      teamCounts: teamCounts,
      rosterViolations: rosterViolations
    };
    
  } catch (error) {
    console.error(`Error reading roster file: ${error.message}`);
    return null;
  }
}

// Print results in a nice format
function printResults(results) {
  if (!results) return;
  
  const rosterType = results.isPlayoffRoster ? "PLAYOFF ROSTER" : "REGULAR SEASON ROSTER";
  console.log(`\n=== ${rosterType} ANALYSIS: ${results.file} ===`);
  console.log(`Total Players: ${results.totalPlayers}`);
  console.log(`Active Players: ${results.totalActivePlayers}`);
  console.log(`Reserve Players: ${results.totalReservePlayers}\n`);
  
  console.log("OVERALL ACTIVE PLAYER COUNTS:");
  console.log(`  Forwards: ${results.overallCounts.forwards}`);
  console.log(`  Defensemen: ${results.overallCounts.defensemen}`);
  console.log(`  Goalies: ${results.overallCounts.goalies}`);
  if (results.overallCounts.unknown > 0) {
    console.log(`  Unknown: ${results.overallCounts.unknown}`);
  }
  
  console.log("\nBY TEAM:");
  const teams = Object.keys(results.teamCounts).sort();
  teams.forEach(team => {
    const teamData = results.teamCounts[team];
    const total = teamData.forwards + teamData.defensemen + teamData.goalies + teamData.unknown;
    const violations = results.rosterViolations[team];
    
    let teamLine = `  ${team}: ${total} total (F:${teamData.forwards}, D:${teamData.defensemen}, G:${teamData.goalies}${teamData.unknown > 0 ? `, U:${teamData.unknown}` : ''})`;
    
    if (violations && violations.length > 0) {
      teamLine += ` ❌ ILLEGAL: ${violations.join(', ')}`;
    }
    
    console.log(teamLine);
  });
  
  // Summary of violations
  const violationCount = Object.keys(results.rosterViolations).length;
  if (violationCount > 0) {
    console.log(`\n⚠️  ROSTER VIOLATIONS DETECTED: ${violationCount} team(s) have illegal rosters`);
  } else {
    console.log(`\n✅ ALL ROSTERS LEGAL: No violations detected`);
  }
}

// Command line usage
if (import.meta.url === `file://${process.argv[1]}`) {
  const rosterFile = process.argv[2];
  
  if (!rosterFile) {
    console.log("Usage: node countActiveRoster.js <roster-file>");
    console.log("\nExamples:");
    console.log("  node countActiveRoster.js src/data/static/rosters/rosters_p25.csv");
    console.log("  node countActiveRoster.js src/data/static/rosters/rosters_p01.csv");
    console.log("  node countActiveRoster.js src/data/static/rosters/rosters_playoff_r01.csv");
    console.log("  node countActiveRoster.js src/data/static/rosters/rosters_playoff_r02.csv");
    process.exit(1);
  }
  
  const results = countActiveRoster(rosterFile);
  printResults(results);
}

// Export for use as a module
export { countActiveRoster, printResults };