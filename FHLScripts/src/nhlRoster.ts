import axios from 'axios';

// NHL team abbreviations as used by api-web.nhle.com's roster endpoint. Update if a team
// relocates/rebrands or the league expands. Includes defunct/renamed codes (ARI was the Arizona
// Coyotes through 2023-24, UTA has been the same franchise since 2024-25); a team/season pair that
// didn't exist returns 404 and is skipped.
export const NHL_TEAM_ABBREVS = [
  'ANA', 'ARI', 'BOS', 'BUF', 'CAR', 'CBJ', 'CGY', 'CHI', 'COL', 'DAL', 'DET', 'EDM', 'FLA', 'LAK', 'MIN', 'MTL',
  'NJD', 'NSH', 'NYI', 'NYR', 'OTT', 'PHI', 'PIT', 'SEA', 'SJS', 'STL', 'TBL', 'TOR', 'UTA', 'VAN', 'VGK', 'WPG',
  'WSH',
];

export interface NhlRosterEntry {
  nhlId: number;
  firstName: string;
  lastName: string;
  birthDate: string;
  positionCode: string;
}

// Hockey-Reference labels a season by its ending year (e.g. the 2025-26 season is "2026").
export function latestSeasonEndYear(today: Date = new Date()): number {
  const year = today.getFullYear();
  const month = today.getMonth() + 1;
  // The new season's roster/schedule data isn't meaningfully populated until it starts in October.
  return month >= 10 ? year + 1 : year;
}

// NHL's roster endpoint wants a season as the concatenation of its start/end years, e.g. "20252026".
export function seasonStrings(count: number, today: Date = new Date()): string[] {
  const latest = latestSeasonEndYear(today);
  return Array.from({ length: count }, (_, i) => {
    const endYear = latest - i;
    return `${endYear - 1}${endYear}`;
  });
}

// Fetches team rosters (name/birthdate/position) across the given seasons, deduped by NHL player id.
// This is a handful of unthrottled requests to NHL's own API, unlike Hockey-Reference's per-player pages.
export async function fetchNhlRosterIndex(
  seasons: string[],
  teams: string[] = NHL_TEAM_ABBREVS,
  delayBetweenRequests = 100,
): Promise<NhlRosterEntry[]> {
  const byId = new Map<number, NhlRosterEntry>();
  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  for (const season of seasons) {
    for (const team of teams) {
      try {
        const response = await axios.get(`https://api-web.nhle.com/v1/roster/${team}/${season}`);
        const groups: any[] = [response.data.forwards, response.data.defensemen, response.data.goalies];
        for (const group of groups) {
          for (const player of group ?? []) {
            byId.set(player.id, {
              nhlId: player.id,
              firstName: player.firstName?.default ?? '',
              lastName: player.lastName?.default ?? '',
              birthDate: player.birthDate,
              positionCode: player.positionCode,
            });
          }
        }
      } catch (error) {
        // 404 just means the team didn't exist that season (e.g. UTA before 2024-25, ARI after 2023-24).
        if (!(axios.isAxiosError(error) && error.response?.status === 404)) {
          console.log(`Error fetching NHL roster for ${team} ${season}: ${error}`);
        }
      }
      await sleep(delayBetweenRequests);
    }
  }
  return Array.from(byId.values());
}

function normalizeName(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '');
}

// Hockey-Reference player ids are built from the first 5 letters of the last name, the first 2
// letters of the first name, then a 2-digit disambiguator, e.g. "abruzni01" -> Abruzzese, Nicholas.
export function decodeHockeyRefId(hockeyRefId: string): { lastNamePart: string; firstNamePart: string } {
  const stripped = hockeyRefId.replace(/\d{2}$/, '');
  return {
    lastNamePart: stripped.slice(0, -2),
    firstNamePart: stripped.slice(-2),
  };
}

// Matches a Hockey-Reference id against the NHL roster index by decoding its name prefixes.
// Only returns a birthdate when exactly one roster entry matches, to avoid guessing between
// same-prefix players (e.g. two Sebastian Ahos).
export function findBirthDate(hockeyRefId: string, roster: NhlRosterEntry[]): string | undefined {
  const { lastNamePart, firstNamePart } = decodeHockeyRefId(hockeyRefId);
  const matchesByPrefix = (firstNamePrefix: string) => roster.filter((entry) => {
    return normalizeName(entry.lastName).startsWith(lastNamePart) && normalizeName(entry.firstName).startsWith(firstNamePrefix);
  });

  const strictMatches = matchesByPrefix(firstNamePart);
  if (strictMatches.length === 1) {
    return strictMatches[0].birthDate;
  }
  if (strictMatches.length > 1) {
    // Genuinely ambiguous (e.g. two Sebastian Ahos) - don't guess.
    return undefined;
  }

  // No strict match: some old ids were generated from an alternate transliteration of the first
  // name (e.g. Hockey-Reference's "varlasi01" for Semyon Varlamov, from an early "Simeon" spelling).
  // Retry on just the first letter, which usually survives that kind of drift.
  const looseMatches = matchesByPrefix(firstNamePart.charAt(0));
  return looseMatches.length === 1 ? looseMatches[0].birthDate : undefined;
}
