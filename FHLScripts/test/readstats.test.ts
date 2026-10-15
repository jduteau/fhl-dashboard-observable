import fs from 'fs';
import path from 'path';
import axios from 'axios';

import { PlayerStats } from '../src/playerinfo';
import { ReadStats } from '../src/readStats';


const skatersHtml = fs.readFileSync(path.resolve(__dirname, './hockey-ref-skaters-response.html'), 'utf8');
const goaliesHtml = fs.readFileSync(path.resolve(__dirname, './hockey-ref-goalies-response.html'), 'utf8');

jest.mock('axios');
console.log = jest.fn();
const mockedAxios = axios as jest.Mocked<typeof axios>;

beforeEach(() => {
  jest.resetAllMocks();
});


describe('Fetch HREF Stats', () => {

  it('retrieve skaters page should have items', async () => {
    let playersToLoad: PlayerStats[] = [];
    mockedAxios.get.mockResolvedValueOnce({ status: 200, data: skatersHtml });
    return new ReadStats().retrieveStatsPage(playersToLoad, new ReadStats().skaterStatistics(2021, false)).then(() => {
      expect(playersToLoad).toHaveLength(0);
    });
  });

  it('retrieve goalies page should have items', async () => {
    let playersToLoad: PlayerStats[] = [];
    mockedAxios.get.mockResolvedValueOnce({ status: 200, data: goaliesHtml });
    return new ReadStats().retrieveStatsPage(playersToLoad, new ReadStats().goalieStatistics(2021, false)).then(() => {
      expect(playersToLoad).toHaveLength(6);
    });
  });

  it('skaterStatistics has the proper values', () => {
    const statsProvider = new ReadStats().skaterStatistics(2022, false);
    expect(statsProvider.url).toBe('https://www.hockey-reference.com/leagues/NHL_2022_skaters.html');
    expect(statsProvider.tableId).toBe('player_stats');
  });

  it('goalieStatistics has the proper values', () => {
    const statsProvider = new ReadStats().goalieStatistics(2022, false);
    expect(statsProvider.url).toBe('https://www.hockey-reference.com/leagues/NHL_2022_goalies.html');
    expect(statsProvider.tableId).toBe('goalie_stats');
  });

  it('skaterStatistics with playoffs has the proper values', () => {
    const statsProvider = new ReadStats().skaterStatistics(2022, true);
    expect(statsProvider.url).toBe('https://www.hockey-reference.com/leagues/NHL_2022_skaters.html');
    expect(statsProvider.tableId).toBe('player_stats_post');
  });

  it('goalieStatistics with playoffs has the proper values', () => {
    const statsProvider = new ReadStats().goalieStatistics(2022, true);
    expect(statsProvider.url).toBe('https://www.hockey-reference.com/leagues/NHL_2022_goalies.html');
    expect(statsProvider.tableId).toBe('goalie_stats_post');
  });

  test('read players', async () => {
    mockedAxios.get.mockResolvedValueOnce({ status: 200, data: skatersHtml });
    // mockedAxios.get.mockResolvedValueOnce({ status: 200, data: advSkatersHtml });
    mockedAxios.get.mockResolvedValueOnce({ status: 200, data: goaliesHtml });
    const prePlayerStatsString = fs.readFileSync('test/2023_stats.json', 'utf8');
    await new ReadStats().readStats('2023', 'test/2023_stats.json');
    const postPlayerStatsString = fs.readFileSync('test/2023_stats.json', 'utf8');
    expect(postPlayerStatsString).toEqual(prePlayerStatsString);
  });

  test('convert skater to csv', () => {
    const playerString = '{"hockeyRef":"acciano01","team":"PIT","pos":"C","stats":{"gp":3,"goals":0,"assists":0,"pim":0,"plusMinus":0,"ppg":0,"shg":0,"gwg":0,"fow":15,"fol":16,"shots":4,"blocks":5,"hits":8,"toi":39,"take":2,"give":0}}';
    const player = JSON.parse(playerString);
    const csvString = new ReadStats().convertToCsvLine(player);
    expect(csvString).toEqual('acciano01,PIT,C,3,0,0,0,0,0,0,0,15,16,4,5,8,39,2,0,,,,,,');
  });

  test('convert goalie to csv', () => {
    const playerString = '{"hockeyRef":"wolljo01","team":"TOR","pos":"G","stats":{"gp":1,"toi":56,"wins":0,"losses":1,"ties":0,"ga":3,"sa":30,"so":0,"goals":0,"assists":0,"pim":0}}';
    const player = JSON.parse(playerString);
    const csvString = new ReadStats().convertToCsvLine(player);
    expect(csvString).toEqual('wolljo01,TOR,G,1,0,0,0,,,,,,,,,,56,,,0,1,0,3,30,0');
  });

  test('convert lines to csv', () => {
    const playerString = '[{"hockeyRef":"acciano01","team":"PIT","pos":"C","stats":{"gp":3,"goals":0,"assists":0,"pim":0,"plusMinus":0,"ppg":0,"shg":0,"gwg":0,"fow":15,"fol":16,"shots":4,"blocks":5,"hits":8,"toi":39,"take":2,"give":0}},{"hockeyRef":"wolljo01","team":"TOR","pos":"G","stats":{"gp":1,"toi":56,"wins":0,"losses":1,"ties":0,"ga":3,"sa":30,"so":0,"goals":0,"assists":0,"pim":0}}]';
    const players = JSON.parse(playerString);
    const csvString = new ReadStats().convertToCsv(players);
    expect(csvString).toEqual('hockeyRef,team,pos,stats/gp,stats/goals,stats/assists,stats/pim,stats/plusMinus,stats/ppg,stats/shg,stats/gwg,stats/how,stats/fol,stats/shots,stats/blocks,stats/hits,stats/toi,stats/take,stats/give,stats/wins,stats/losses,stats/ties,stats/ga,stats/sa,stats/so\r\nacciano01,PIT,C,3,0,0,0,0,0,0,0,15,16,4,5,8,39,2,0,,,,,,\r\nwolljo01,TOR,G,1,0,0,0,,,,,,,,,,56,,,0,1,0,3,30,0\r\n');
  });

});

