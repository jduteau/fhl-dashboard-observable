import * as fs from 'fs';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { fetchNhlRosterIndex, findBirthDate, latestSeasonEndYear, seasonStrings } from './nhlRoster';
import { PlayerInfo, PlayerStats } from './playerinfo';
import { ReadStats } from './readStats';

export class ReadPlayers {
  public async readPlayers(playerFile : string, outputFile: string, timeToWait = 3500) {
    const playerInfoString = fs.readFileSync(playerFile, 'utf8');
    let players : string[] = playerInfoString.split('\n');
    let returnedPlayers = await this.fetchPlayers(players, timeToWait);

    fs.writeFileSync(outputFile + '.json', JSON.stringify(returnedPlayers));
    fs.writeFileSync(outputFile + '.csv', this.convertToCsv(returnedPlayers));
  }

  // Resolves most players from a handful of bulk requests (recent seasons' Hockey-Reference stats
  // tables for name/team/position, and NHL's own roster API for birthdate) instead of one throttled
  // Hockey-Reference page per player. Only players that can't be resolved in bulk - retired players,
  // or ones whose id can't be matched unambiguously - fall back to the slow per-player scrape.
  public async fetchPlayers(players: string[], timeToWait: number, seasonsBack = 3) : Promise<PlayerInfo[]> {
    const [hockeyRefIndex, nhlRoster] = await Promise.all([
      this.buildHockeyRefIndex(seasonsBack),
      fetchNhlRosterIndex(seasonStrings(seasonsBack)),
    ]);

    let returnedPlayers : PlayerInfo[] = [];
    const fallbackIds : string[] = [];

    for (const playerId of players) {
      if (playerId.startsWith('P-')) {
        returnedPlayers.push({ ID: playerId, Player: '---', Tm: '---', BirthDate: '---', Pos: '---' });
        continue;
      }
      const stats = hockeyRefIndex.get(playerId);
      const birthDate = findBirthDate(playerId, nhlRoster);
      if (stats !== undefined && birthDate !== undefined) {
        returnedPlayers.push({ ID: playerId, Player: stats.name, Tm: stats.team, Pos: stats.pos, BirthDate: birthDate });
      } else {
        fallbackIds.push(playerId);
      }
    }

    if (fallbackIds.length > 0) {
      console.log(`Falling back to per-player lookup for ${fallbackIds.length} player(s): ${fallbackIds.join(', ')}`);
      const addPlayers = this.fetchPlayer(returnedPlayers);
      const sleep = (ms : number) => new Promise(resolve => setTimeout(resolve, ms));
      for (const playerId of fallbackIds) {
        await addPlayers(playerId);
        process.stdout.write('.');
        await sleep(timeToWait);
      }
    }

    const order = new Map(players.map((id, index) => [id, index]));
    returnedPlayers.sort((a, b) => (order.get(a.ID) ?? 0) - (order.get(b.ID) ?? 0));
    return returnedPlayers;
  }

  // Builds a Hockey-Reference id -> {name, team, pos} index from the last `seasonsBack` seasons'
  // league-wide stats pages, i.e. a handful of requests instead of one per player.
  public async buildHockeyRefIndex(seasonsBack: number) : Promise<Map<string, PlayerStats>> {
    const readStats = new ReadStats();
    const index = new Map<string, PlayerStats>();
    const latest = latestSeasonEndYear();

    for (let year = latest; year > latest - seasonsBack; year--) {
      const playersToLoad : PlayerStats[] = [];
      await readStats.retrieveStatsPage(playersToLoad, readStats.skaterStatistics(year, false));
      await readStats.retrieveStatsPage(playersToLoad, readStats.goalieStatistics(year, false));
      for (const player of playersToLoad) {
        if (!index.has(player.hockeyRef)) {
          index.set(player.hockeyRef, player);
        }
      }
    }
    return index;
  }

  public fetchPlayer(returnedPlayers: PlayerInfo[]) {
    return async (playerId: string) => {
      // If id starts with 'P-', then it's not a real hockey-reference page and just return the player.
      if (!playerId.startsWith('P-')) {
        // For each player, find their hockey-reference page and update their name, birthdate, and current team
        let { name, birthDate, nhlTeam, position } = await this.fetchPlayerBirthDateAndTeam(playerId);
        returnedPlayers.push({ ID: name === undefined ? `P-${playerId}` : playerId, Player: name || '---', Tm: nhlTeam || '---', BirthDate: birthDate || '---', Pos: position || '---' });
      } else {
        returnedPlayers.push({ ID: playerId, Player: '---', Tm: '---', BirthDate: '---', Pos: '---' });
      }
    };
  }

  public fetchPlayerBirthDateAndTeam = async function(hockeyRefId: string)
    : Promise<{ name: string | undefined; birthDate: string | undefined; nhlTeam: string | undefined; position: string | undefined }> {
    return axios.get(`https://www.hockey-reference.com/players/${hockeyRefId.charAt(0)}/${hockeyRefId}.html`).then(
      (response) => {
        const $ = cheerio.load(response.data);
        //NHL team is in the format "/teams/XXX/"
        const returnValue = {
          name: $('div.players h1 span').text(),
          birthDate: $('div.players span#necro-birth').attr('data-birth'),
          nhlTeam: $('div.players p:contains("Team") span a[href^="/teams"]').attr('href')?.slice(7, 10),
          position: '---',
        };
        let positionText = $('div.players p:contains("Position")').text();
        let positionEnd = positionText.search('•') || positionText.length;
        returnValue.position = positionText.slice(positionText.search(':')+2, positionEnd-1).trim();

        // Should always have a birthdate so log if it is missing
        if (returnValue.birthDate === undefined) {
          console.log(`Player page ${hockeyRefId}does not include birthDate`);
        }
        // If no nhl team set, look for the team that drafted the player
        if (returnValue.nhlTeam == undefined) {
          returnValue.nhlTeam = $('div.players p:contains("Draft") a[href^="/teams"]').attr('href')?.slice(7, 10);
        }
        return returnValue;
      },
      (error) => {
        console.log(`Error fetching player page for ${hockeyRefId}: ${error}`);
        return { name: undefined, birthDate: undefined, nhlTeam: undefined, position: undefined };
      },
    );
  };

  public convertToCsv(players: PlayerInfo[]) {
    var str = '';
    for (var player of players) {
      str += this.convertToCsvLine(player) + '\r\n';
    }
    return str;
  };

  public convertToCsvLine(player: PlayerInfo) {
    return `${player.ID},"${player.Player}",${player.Tm},${player.BirthDate},${player.Pos}`;
  };

}
