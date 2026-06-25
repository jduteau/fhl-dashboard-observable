import {readCsvFile} from "../components/loadfiles.js";

const draftOrder = await readCsvFile("src/data/static/draft_order.csv");
const currentPicks = await readCsvFile("src/data/static/current_picks.csv");
const teamInfo = await readCsvFile("src/data/static/team_info.csv");

// Build a lookup map: pick key (e.g. "ANA1") -> owner
const pickOwnerMap = {};
for (const pick of currentPicks) {
  pickOwnerMap[pick.PICK] = pick.OWNER;
}

// Build a lookup map: ABBR -> NAME
const teamNameMap = {};
for (const team of teamInfo) {
  teamNameMap[team.ABBR] = team.NAME;
}

// Determine which rounds beyond 1 exist in current_picks
const roundsInPicks = [...new Set(currentPicks.map(p => {
  const match = p.PICK.match(/\d+$/);
  return match ? parseInt(match[0]) : null;
}).filter(Boolean))].sort((a, b) => a - b);

const otherRounds = roundsInPicks.filter(r => r > 1);

// Round 1 order
const round1Rows = draftOrder
  .filter(row => row.ROUND === "1")
  .sort((a, b) => +a.ORDER - +b.ORDER)
  .map(row => ({
    order: +row.ORDER,
    pick: row.TEAM,
    pickName: teamNameMap[row.TEAM] || row.TEAM,
    owner: pickOwnerMap[`${row.TEAM}1`] || "—",
    ownerName: teamNameMap[pickOwnerMap[`${row.TEAM}1`]] || "—"
  }));

// Other rounds order (ROUND=2 rows define the order for all rounds 2+)
const otherRoundsRows = draftOrder
  .filter(row => row.ROUND === "2")
  .sort((a, b) => +a.ORDER - +b.ORDER)
  .map(row => {
    const entry = {
      order: +row.ORDER,
      pick: row.TEAM,
      pickName: teamNameMap[row.TEAM] || row.TEAM
    };
    for (const r of otherRounds) {
      const owner = pickOwnerMap[`${row.TEAM}${r}`] || "—";
      entry[`r${r}`] = owner;
      entry[`r${r}Name`] = teamNameMap[owner] || "—";
    }
    return entry;
  });

// Combined rows: zip R1 and R2-4 by position order
const maxRows = Math.max(round1Rows.length, otherRoundsRows.length);
const combinedRows = Array.from({length: maxRows}, (_, i) => {
  const r1Row = round1Rows[i] || {};
  const otherRow = otherRoundsRows[i] || {};
  const combined = {
    order: i + 1,
    r1pick: r1Row.pick || "—",
    r1: r1Row.owner || "—",
    r2pick: otherRow.pick || "—"
  };
  for (const r of otherRounds) {
    combined[`r${r}`] = otherRow[`r${r}`] || "—";
  }
  return combined;
});

process.stdout.write(JSON.stringify({
  round1: round1Rows,
  otherRounds: otherRoundsRows,
  otherRoundNumbers: otherRounds,
  combined: combinedRows
}));
