import * as fs from 'fs';
import axios from 'axios';

import * as nhlRoster from '../src/nhlRoster';
import { PlayerInfo, PlayerStats } from '../src/playerinfo';
import { ReadPlayers } from '../src/readPlayers';
import { ReadStats } from '../src/readStats';

jest.mock('axios');
jest.mock('../src/nhlRoster');
const mockedAxios = axios as jest.Mocked<typeof axios>;
const mockedFetchNhlRosterIndex = nhlRoster.fetchNhlRosterIndex as jest.Mock;
const mockedFindBirthDate = nhlRoster.findBirthDate as jest.Mock;
const mockedLatestSeasonEndYear = nhlRoster.latestSeasonEndYear as jest.Mock;
const mockedSeasonStrings = nhlRoster.seasonStrings as jest.Mock;

const ryan_html = fs.readFileSync('test/ryan_ufko_page.html', 'utf8');
const noel_html = fs.readFileSync('test/noel_acciari_page.html', 'utf8');
const nicholas_html = fs.readFileSync('test/nicholas_abruzzese_page.html', 'utf8');
const lukas_html = fs.readFileSync('test/lukas_dostal_page.html', 'utf8');
const linus_html = fs.readFileSync('test/linus_ullmark_page.html', 'utf8');

beforeEach(() => {
  jest.resetAllMocks();
  mockedLatestSeasonEndYear.mockReturnValue(2026);
  mockedSeasonStrings.mockReturnValue(['20252026', '20242025', '20232024']);
  mockedFetchNhlRosterIndex.mockResolvedValue([]);
  mockedFindBirthDate.mockReturnValue(undefined);
});

// The bulk index is built by delegating to ReadStats' (already-tested) league stats page parsing,
// so these tests stub its network-touching method and feed it pre-built PlayerStats rows instead
// of real Hockey-Reference HTML.
function stubHockeyRefIndex(bySeasonTable: Record<string, PlayerStats[]>) {
  jest.spyOn(ReadStats.prototype, 'retrieveStatsPage').mockImplementation(async (playersToLoad: PlayerStats[], statsProvider: any) => {
    for (const player of bySeasonTable[statsProvider.tableId] ?? []) {
      playersToLoad.push(player);
    }
  });
}

describe('fetchPlayerBirthDateAndTeam (per-player fallback)', () => {
  test('find player with no team', async () => {
    mockedAxios.get.mockResolvedValueOnce({ status: 200, data: ryan_html });
    expect(await new ReadPlayers().fetchPlayerBirthDateAndTeam('ufkory01')).toEqual({ name: 'Ryan Ufko', birthDate: '2003-05-07', nhlTeam: 'NSH', position: 'D' });
  });

  test('find player with team', async () => {
    mockedAxios.get.mockResolvedValueOnce({ status: 200, data: noel_html });
    expect(await new ReadPlayers().fetchPlayerBirthDateAndTeam('acciano01')).toEqual({ name: 'Noel Acciari', birthDate: '1991-12-01', nhlTeam: 'PIT', position: 'C' });
  });
});

describe('fetchPlayer (per-player fallback)', () => {
  test('fetch player with no team', async () => {
    mockedAxios.get.mockResolvedValueOnce({ status: 200, data: ryan_html });
    let players : PlayerInfo[] = [];
    await new ReadPlayers().fetchPlayer(players)('ufkory01');
    expect(players).toEqual([{ ID: 'ufkory01', Player: 'Ryan Ufko', Tm: 'NSH', Pos: 'D', BirthDate: '2003-05-07' }]);
  });

  test('fetch player with nothing after position', async () => {
    mockedAxios.get.mockResolvedValueOnce({ status: 200, data: linus_html });
    let players : PlayerInfo[] = [];
    await new ReadPlayers().fetchPlayer(players)('ullmali01');
    expect(players).toEqual([{ ID: 'ullmali01', Player: 'Linus Ullmark', Tm: 'BOS', Pos: 'G', BirthDate: '1993-07-31' }]);
  });

  test('fetch player with special characters', async () => {
    mockedAxios.get.mockResolvedValueOnce({ status: 200, data: lukas_html });
    let players : PlayerInfo[] = [];
    await new ReadPlayers().fetchPlayer(players)('dostalu01');
    expect(players).toEqual([{ ID: 'dostalu01', Player: 'Lukáš Dostál', Tm: 'ANA', Pos: 'G', BirthDate: '2000-06-22' }]);
  });

  test('fetch player with Prospect ID', async () => {
    let players : PlayerInfo[] = [];
    await new ReadPlayers().fetchPlayer(players)('P-dostalu01');
    expect(players).toEqual([{ ID: 'P-dostalu01', Player: '---', Tm: '---', Pos: '---', BirthDate: '---' }]);
  });
});

describe('fetchPlayers (bulk-first path)', () => {
  it('resolves a player entirely from the bulk indexes, without any per-player requests', async () => {
    stubHockeyRefIndex({
      player_stats: [{ hockeyRef: 'abruzni01', name: 'Nicholas Abruzzese', team: 'TOR', pos: 'C', stats: {} }],
    });
    mockedFindBirthDate.mockImplementation((id: string) => (id === 'abruzni01' ? '1999-06-04' : undefined));

    const players = await new ReadPlayers().fetchPlayers(['abruzni01'], 1);

    expect(players).toEqual([{ ID: 'abruzni01', Player: 'Nicholas Abruzzese', Tm: 'TOR', Pos: 'C', BirthDate: '1999-06-04' }]);
    expect(mockedAxios.get).not.toHaveBeenCalled();
  });

  it('leaves prospect placeholder ids untouched and never queries for them', async () => {
    stubHockeyRefIndex({});

    const players = await new ReadPlayers().fetchPlayers(['P-someid'], 1);

    expect(players).toEqual([{ ID: 'P-someid', Player: '---', Tm: '---', BirthDate: '---', Pos: '---' }]);
    expect(mockedAxios.get).not.toHaveBeenCalled();
  });

  it('falls back to the per-player scrape only for players missing from the bulk indexes, preserving input order', async () => {
    stubHockeyRefIndex({
      player_stats: [{ hockeyRef: 'acciano01', name: 'Noel Acciari', team: 'PIT', pos: 'C', stats: {} }],
    });
    mockedFindBirthDate.mockImplementation((id: string) => (id === 'acciano01' ? '1991-12-01' : undefined));
    // abruzni01 and ufkory01 aren't in the bulk indexes, so they go through the slow per-player path, in order.
    mockedAxios.get
      .mockResolvedValueOnce({ status: 200, data: nicholas_html })
      .mockResolvedValueOnce({ status: 200, data: ryan_html });

    const players = await new ReadPlayers().fetchPlayers(['abruzni01', 'acciano01', 'ufkory01'], 1);

    expect(players).toEqual([
      { ID: 'abruzni01', Player: 'Nicholas Abruzzese', Tm: 'TOR', Pos: 'C', BirthDate: '1999-06-04' },
      { ID: 'acciano01', Player: 'Noel Acciari', Tm: 'PIT', Pos: 'C', BirthDate: '1991-12-01' },
      { ID: 'ufkory01', Player: 'Ryan Ufko', Tm: 'NSH', Pos: 'D', BirthDate: '2003-05-07' },
    ]);
  });

  it('queries the last N seasons of Hockey-Reference stats pages and NHL rosters', async () => {
    stubHockeyRefIndex({});
    // abruzni01 won't resolve from the (empty) bulk indexes, so it takes the per-player fallback too.
    mockedAxios.get.mockResolvedValueOnce({ status: 200, data: nicholas_html });

    await new ReadPlayers().fetchPlayers(['abruzni01'], 1, 3);

    expect(ReadStats.prototype.retrieveStatsPage).toHaveBeenCalledTimes(6); // skaters + goalies x 3 seasons
    expect(mockedSeasonStrings).toHaveBeenCalledWith(3);
  });
});

describe('readPlayers (end-to-end file read/write)', () => {
  it('writes json/csv using the bulk-first fetch path', async () => {
    const bulkPlayers: PlayerStats[] = [
      { hockeyRef: 'abruzni01', name: 'Nicholas Abruzzese', team: 'TOR', pos: 'C', stats: {} },
      { hockeyRef: 'acciano01', name: 'Noel Acciari', team: 'PIT', pos: 'C', stats: {} },
      { hockeyRef: 'ufkory01', name: 'Ryan Ufko', team: 'NSH', pos: 'D', stats: {} },
    ];
    const bulkGoalies: PlayerStats[] = [
      { hockeyRef: 'dostalu01', name: 'Lukáš Dostál', team: 'ANA', pos: 'G', stats: {} },
      { hockeyRef: 'ullmali01', name: 'Linus Ullmark', team: 'BOS', pos: 'G', stats: {} },
    ];
    stubHockeyRefIndex({ player_stats: bulkPlayers, goalie_stats: bulkGoalies });

    const birthDates: Record<string, string> = {
      abruzni01: '1999-06-04', acciano01: '1991-12-01', ufkory01: '2003-05-07', dostalu01: '2000-06-22', ullmali01: '1993-07-31',
    };
    mockedFindBirthDate.mockImplementation((id: string) => birthDates[id]);

    const prePlayerInfoString = fs.readFileSync('test/fhl_small_players-valid.json', 'utf8');
    await new ReadPlayers().readPlayers('test/fhl_small_players.txt', 'test/fhl_small_players.json', 1);
    const postPlayerInfoString = fs.readFileSync('test/fhl_small_players.json', 'utf8');
    expect(postPlayerInfoString).toEqual(prePlayerInfoString);
    expect(mockedAxios.get).not.toHaveBeenCalled();
  });
});
