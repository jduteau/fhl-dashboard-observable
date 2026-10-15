import * as fs from 'fs';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { PlayerStats } from './playerinfo';

interface StatsProvider {
  url: string;
  tableId: string;
  extractStats: (elem: any) => PlayerStats;
}

export class ReadStats {

  public async readStats(statsYear: string, statsFile: string) {
    const playoffs = statsYear.endsWith('P');
    const seasonYear = parseInt(playoffs ? statsYear.slice(0, -1) : statsYear);

    console.log(`Parsing the statistics from Hockey-Reference for year ${seasonYear} (Playoffs: ${playoffs})`);
    let playersToLoad : PlayerStats[] = [];
    await this.retrieveStatsPage(playersToLoad, this.skaterStatistics(seasonYear, playoffs));
    await this.retrieveStatsPage(playersToLoad, this.goalieStatistics(seasonYear, playoffs));
    // await this.retrieveStatsPage(playersToLoad, this.advancedSkaterStatistics(seasonYear, playoffs));

    fs.writeFileSync(statsFile + '.json', JSON.stringify(playersToLoad));
    fs.writeFileSync(statsFile + '.csv', this.convertToCsv(playersToLoad));

    console.log(`Success!  Loaded ${playersToLoad.length} players.`);
  };

  public async retrieveStatsPage(playersToLoad: PlayerStats[], statsProvider: StatsProvider) {

    await axios.get(statsProvider.url).then(function logSuccess(response) {
      const $ = cheerio.load(response.data);
      const statsTable = $(`table#${statsProvider.tableId} > tbody > tr:not(.partial_table):not(.thead):not(.norank)`);
      statsTable.each((_, elem) => {
        let newPlayer: PlayerStats = statsProvider.extractStats($(elem));
        let existingPlayer: PlayerStats | undefined = playersToLoad.find((player) => {return player.hockeyRef == newPlayer.hockeyRef;});
        if ( existingPlayer !== undefined && existingPlayer.stats !== undefined) {
          Object.assign(existingPlayer.stats, newPlayer.stats);
        } else {
          playersToLoad.push(newPlayer);
        }
      });
    });
  };

  public skaterStatistics(statsYear: number, playoffs: boolean) {
    return {
      url: `https://www.hockey-reference.com/leagues/NHL_${statsYear}_skaters.html`,
      tableId: playoffs ? 'player_stats_post' : 'player_stats',
      extractStats: function(elem) : PlayerStats {
        return {
          hockeyRef: elem.find('[data-stat="name_display"]').attr('data-append-csv') ?? 'no-id',
          name: elem.find('[data-stat="name_display"]').text().trim(),
          team: elem.find('[data-stat="team_name_abbr"]').text().trim(),
          pos: elem.find('[data-stat="pos"]').text(),
          stats: {
            gp: parseInt(elem.find('[data-stat="games"]').text()),
            goals: parseInt(elem.find('[data-stat="goals"]').text()),
            assists: parseInt(elem.find('[data-stat="assists"]').text()),
            pim: parseInt(elem.find('[data-stat="pen_min"]').text()),
            plusMinus: parseInt(elem.find('[data-stat="plus_minus"]').text()),
            ppg: parseInt(elem.find('[data-stat="goals_pp"]').text()),
            shg: parseInt(elem.find('[data-stat="goals_sh"]').text()),
            gwg: parseInt(elem.find('[data-stat="goals_gw"]').text()),
            fow: parseInt(elem.find('[data-stat="faceoff_wins"]').text()),
            fol: parseInt(elem.find('[data-stat="faceoff_losses"]').text()),
            shots: parseInt(elem.find('[data-stat="shots"]').text()),
            blocks: parseInt(elem.find('[data-stat="blocks"]').text()),
            hits: parseInt(elem.find('[data-stat="hits"]').text()),
            take: parseInt(elem.find('[data-stat="takeaways"]').text()),
            give: parseInt(elem.find('[data-stat="giveaways"]').text()),
            toi: parseFloat(elem.find('[data-stat="time_on_ice"]').text()),
          },
        };
      },
    } as StatsProvider;
  };

  public goalieStatistics(statsYear: number, playoffs: boolean) {
    return {
      url: `https://www.hockey-reference.com/leagues/NHL_${statsYear}_goalies.html`,
      tableId: playoffs ? 'goalie_stats_post' : 'goalie_stats',
      extractStats: function(elem : any) : PlayerStats {
        return {
          hockeyRef: elem.find('[data-stat="name_display"]').attr('data-append-csv') ?? 'no-id',
          name: elem.find('[data-stat="name_display"]').text().trim(),
          team: elem.find('[data-stat="team_name_abbr"]').text().trim(),
          pos: 'G',
          stats: {
            gp: parseInt(elem.find('[data-stat="goalie_games"]').text()),
            starts: parseInt(elem.find('[data-stat="goalie_starts"]').text()),
            toi: parseInt(elem.find('[data-stat="goalie_min"]').text()),
            wins: parseInt(elem.find('[data-stat="goalie_wins"]').text()),
            losses: parseInt(elem.find('[data-stat="goalie_losses"]').text()),
            ties: parseInt(playoffs ? '0' : elem.find('[data-stat="goalie_ties"]').text()),
            ga: parseInt(elem.find('[data-stat="goalie_goals_against"]').text()),
            sa: parseInt(elem.find('[data-stat="shots_against_goalie"]').text()),
            so: parseInt(elem.find('[data-stat="goalie_shutouts"]').text()),
            goals: parseInt(elem.find('[data-stat="goals"]').text()),
            assists: parseInt(elem.find('[data-stat="assists"]').text()),
            pim: parseInt(elem.find('[data-stat="pen_min"]').text()),
          },
        };
      },
    };
  };

  public convertToCsv(players: PlayerStats[]) {
    var str = 'hockeyRef,team,pos,stats/gp,stats/goals,stats/assists,stats/pim,stats/plusMinus,stats/ppg,stats/shg,stats/gwg,stats/how,stats/fol,stats/shots,stats/blocks,stats/hits,stats/toi,stats/take,stats/give,stats/wins,stats/losses,stats/ties,stats/ga,stats/sa,stats/so\r\n';
    for (var player of players) {
      str += this.convertToCsvLine(player) + '\r\n';
    }
    return str;
  };

  public convertToCsvLine(player: PlayerStats) {
    return `${player.hockeyRef},${player.team},${player.pos},${player.stats.gp},${player.stats.goals},${player.stats.assists},`+
    `${player.stats.pim},${player.stats.plusMinus == undefined ? '' : player.stats.plusMinus},${player.stats.ppg == undefined ? '' : player.stats.ppg},`+
    `${player.stats.shg == undefined ? '' : player.stats.shg},${player.stats.gwg == undefined ? '' : player.stats.gwg},${player.stats.fow == undefined ? '' : player.stats.fow},`+
    `${player.stats.fol == undefined ? '' : player.stats.fol},${player.stats.shots == undefined ? '' : player.stats.shots},${player.stats.blocks == undefined ? '' : player.stats.blocks},`+
    `${player.stats.hits == undefined ? '' : player.stats.hits},${player.stats.toi == undefined ? '' : player.stats.toi},${player.stats.take == undefined ? '' : player.stats.take},`+
    `${player.stats.give == undefined ? '' : player.stats.give},${player.stats.wins == undefined ? '' : player.stats.wins},${player.stats.losses == undefined ? '' : player.stats.losses},`+
    `${player.stats.ties == undefined ? '' : player.stats.ties},${player.stats.ga == undefined ? '' : player.stats.ga},${player.stats.sa == undefined ? '' : player.stats.sa},`+
    `${player.stats.so == undefined ? '' : player.stats.so}`;
  };

}
