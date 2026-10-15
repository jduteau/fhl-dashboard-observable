import axios from 'axios';
import {
  decodeHockeyRefId,
  fetchNhlRosterIndex,
  findBirthDate,
  latestSeasonEndYear,
  NhlRosterEntry,
  seasonStrings,
} from '../src/nhlRoster';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

beforeEach(() => jest.resetAllMocks());

describe('decodeHockeyRefId', () => {
  it('splits a standard id into last/first name prefixes', () => {
    expect(decodeHockeyRefId('abruzni01')).toEqual({ lastNamePart: 'abruz', firstNamePart: 'ni' });
  });

  it('handles last names shorter than 5 letters', () => {
    expect(decodeHockeyRefId('ufkory01')).toEqual({ lastNamePart: 'ufko', firstNamePart: 'ry' });
  });

  it('handles higher disambiguator numbers', () => {
    expect(decodeHockeyRefId('smithjo12')).toEqual({ lastNamePart: 'smith', firstNamePart: 'jo' });
  });
});

describe('findBirthDate', () => {
  const roster: NhlRosterEntry[] = [
    { nhlId: 1, firstName: 'Nicholas', lastName: 'Abruzzese', birthDate: '1999-06-04', positionCode: 'C' },
    { nhlId: 2, firstName: 'Lukáš', lastName: 'Dostál', birthDate: '2000-06-22', positionCode: 'G' },
  ];

  it('matches on decoded prefixes, ignoring accents and case', () => {
    expect(findBirthDate('dostalu01', roster)).toBe('2000-06-22');
  });

  it('matches an NHL "default" nickname against the id-derived prefix', () => {
    const nicknameRoster: NhlRosterEntry[] = [
      { nhlId: 3, firstName: 'Nick', lastName: 'Abruzzese', birthDate: '1999-06-04', positionCode: 'C' },
    ];
    expect(findBirthDate('abruzni01', nicknameRoster)).toBe('1999-06-04');
  });

  it('returns undefined when there is no match', () => {
    expect(findBirthDate('nomatch99', roster)).toBeUndefined();
  });

  it('returns undefined when multiple roster entries share the same prefixes', () => {
    const ambiguousRoster: NhlRosterEntry[] = [
      { nhlId: 4, firstName: 'Sebastian', lastName: 'Aho', birthDate: '1996-07-26', positionCode: 'C' },
      { nhlId: 5, firstName: 'Sebastian', lastName: 'Aho', birthDate: '1997-02-17', positionCode: 'D' },
    ];
    expect(findBirthDate('ahose01', ambiguousRoster)).toBeUndefined();
  });

  it('falls back to a first-initial match when the id used an old transliteration of the first name', () => {
    // Hockey-Reference's id for Semyon Varlamov is "varlasi01", from an early "Simeon" spelling;
    // the NHL API (and his current display name) has always said "Semyon".
    const varlamovRoster: NhlRosterEntry[] = [
      { nhlId: 6, firstName: 'Semyon', lastName: 'Varlamov', birthDate: '1988-04-27', positionCode: 'G' },
    ];
    expect(findBirthDate('varlasi01', varlamovRoster)).toBe('1988-04-27');
  });

  it('does not widen to a first-initial match when the strict match was ambiguous, not empty', () => {
    const ambiguousRoster: NhlRosterEntry[] = [
      { nhlId: 4, firstName: 'Sebastian', lastName: 'Aho', birthDate: '1996-07-26', positionCode: 'C' },
      { nhlId: 5, firstName: 'Sebastian', lastName: 'Aho', birthDate: '1997-02-17', positionCode: 'D' },
    ];
    // Same first letter as the strict match, so if widening ever kicked in here it would (wrongly) pick one.
    expect(findBirthDate('ahose01', ambiguousRoster)).toBeUndefined();
  });

  it('does not widen past a genuine first-initial collision between unrelated players', () => {
    const collidingRoster: NhlRosterEntry[] = [
      { nhlId: 7, firstName: 'Semyon', lastName: 'Varlamov', birthDate: '1988-04-27', positionCode: 'G' },
      { nhlId: 8, firstName: 'Sam', lastName: 'Varlamov', birthDate: '2001-01-01', positionCode: 'D' },
    ];
    expect(findBirthDate('varlasi01', collidingRoster)).toBeUndefined();
  });
});

describe('latestSeasonEndYear', () => {
  it('uses the current label before the new season starts in October', () => {
    expect(latestSeasonEndYear(new Date('2026-09-19'))).toBe(2026);
  });

  it('rolls over to next year\'s label once the season starts in October', () => {
    expect(latestSeasonEndYear(new Date('2026-10-15'))).toBe(2027);
  });
});

describe('seasonStrings', () => {
  it('builds descending NHL API season strings', () => {
    expect(seasonStrings(3, new Date('2026-09-19'))).toEqual(['20252026', '20242025', '20232024']);
  });
});

describe('fetchNhlRosterIndex', () => {
  it('dedupes players across seasons and teams', async () => {
    mockedAxios.get.mockResolvedValue({
      data: {
        forwards: [{ id: 1, firstName: { default: 'Nick' }, lastName: { default: 'Abruzzese' }, birthDate: '1999-06-04', positionCode: 'C' }],
        defensemen: [],
        goalies: [],
      },
    });
    const roster = await fetchNhlRosterIndex(['20252026'], ['TOR'], 0);
    expect(roster).toEqual([{ nhlId: 1, firstName: 'Nick', lastName: 'Abruzzese', birthDate: '1999-06-04', positionCode: 'C' }]);
  });

  it('logs and continues when a team/season request fails', async () => {
    console.log = jest.fn();
    mockedAxios.get.mockRejectedValue(new Error('network error'));
    const roster = await fetchNhlRosterIndex(['20252026'], ['TOR'], 0);
    expect(roster).toEqual([]);
    expect(console.log).toHaveBeenCalled();
  });
});
