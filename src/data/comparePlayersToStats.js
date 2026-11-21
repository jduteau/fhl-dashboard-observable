import { readCsvFile, latestStatsFile, currentSeason } from "../components/loadfiles.js";

// Checks the current season's player_info.csv against its latest stats file
const playerInfo = await readCsvFile(`src/data/static/${currentSeason}/player_info.csv`);
const playerMultipleTeams = await readCsvFile(`src/data/static/${currentSeason}/player_multiple_teams.csv`);

// Find players who are not in the rosters file
const compareStatsToRoster = async () => {
  const playerIds = new Set(playerInfo.map((player) => player.ID));
  console.log("Players not in the latest stats file:");
  latestStatsFile.filter(
    (player) => !playerIds.has(player.hockeyRef)).forEach((player) => {
      console.log(`${player.hockeyRef}`);
    });
};

// Find players whose teams in player info don't match what is in stats file
const compareTeamsBetweenInfoAndStats = async () => {
    const playerTeamMap = {};
    playerInfo.forEach((player) => {
        playerTeamMap[player.ID] = player.NHL;
    });

    console.log("Players with mismatched teams between player info and stats:");
    latestStatsFile.forEach((player) => {
        const expectedTeam = playerTeamMap[player.hockeyRef];
        if (expectedTeam && expectedTeam !== player.team) {
            const multiplePlayers = playerMultipleTeams.find(p => p.PLAYERS === player.hockeyRef);
            if (!multiplePlayers || multiplePlayers.TEAM !== player.team) {
                console.log(`${player.hockeyRef}: Info Team = ${expectedTeam}, Stats Team = ${player.team}`);
            }
        }
    });
}

compareStatsToRoster();
compareTeamsBetweenInfoAndStats();