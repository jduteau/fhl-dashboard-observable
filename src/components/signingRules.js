// The free-agent signing announcement posted to the league's Discord channel, one line per signing:
//
//   Wed Nov 25 21:00:40 EST 2026
//
//   CAR Matt Kiersted             D  181781   1 C-27
//   LAK Johnathan Kovacevic       D  175803   3 C-27
//
//   4 players signed
//
// i.e. FHL team, player name, position (F, D, G...), HockeyDB id, salary, contract. Lines that do not fit (the date, the
// count, chatter) are ignored. Pure, shared by the Worker (which finds the announcements) and nothing else needs to trust it:
// the workflow that records them validates every field again.
import { TEAM } from "./tradeRules.js";
import { CONTRACT } from "./transactionRules.js";

const LINE = /^([A-Z]{2,4})\s+(\S.*?)\s+(?:C|LW|RW|W|F|D|G)\s+(\d{3,9})\s+(\d{1,4})\s+([\w-]{1,12})$/;

// Discord may show the table as a code block or in bold; strip that before matching.
const plain = (line) => line.replace(/[`*_]/g, "").replace(/\s+/g, " ").trim();

// Returns [{team, name, hockeyDb, salary, contract}] in the order announced.
export function parseSignings(text) {
  const out = [];
  for (const raw of String(text ?? "").split(/\r?\n/)) {
    const m = LINE.exec(plain(raw));
    if (!m || !TEAM.test(m[1]) || !CONTRACT.test(m[5]) || !m[2].includes(" ")) continue;
    out.push({ team: m[1], name: m[2], hockeyDb: m[3], salary: Number(m[4]), contract: m[5] });
  }
  return out;
}
