export function buildSeasonDraftOrder(draftOrderData, currentPicks, teamInfo) {
  const pickOwnerMap = {};
  for (const pick of currentPicks) {
    pickOwnerMap[pick.PICK] = pick.OWNER;
  }

  const teamNameMap = {};
  for (const team of teamInfo) {
    teamNameMap[team.ABBR] = team.NAME;
  }

  const roundsInPicks = [...new Set(currentPicks.map(p => {
    const match = p.PICK.match(/\d+$/);
    return match ? parseInt(match[0]) : null;
  }).filter(Boolean))].sort((a, b) => a - b);

  const otherRounds = roundsInPicks.filter(r => r > 1);

  const round1Rows = draftOrderData
    .filter(row => row.ROUND === "1")
    .sort((a, b) => +a.ORDER - +b.ORDER)
    .map(row => ({
      order: +row.ORDER,
      pick: row.TEAM,
      pickName: teamNameMap[row.TEAM] || row.TEAM,
      owner: pickOwnerMap[`${row.TEAM}1`] || "—",
      ownerName: teamNameMap[pickOwnerMap[`${row.TEAM}1`]] || "—"
    }));

  const otherRoundsRows = draftOrderData
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

  const flat = [];
  for (const row of round1Rows) {
    flat.push({
      round: 1,
      order: row.order,
      pickLabel: `${row.pick}1`,
      originalTeam: row.pick,
      originalTeamName: row.pickName,
      team: row.owner,
      teamName: row.ownerName
    });
  }
  for (const r of otherRounds) {
    for (const row of otherRoundsRows) {
      flat.push({
        round: r,
        order: row.order,
        pickLabel: `${row.pick}${r}`,
        originalTeam: row.pick,
        originalTeamName: row.pickName,
        team: row[`r${r}`],
        teamName: row[`r${r}Name`]
      });
    }
  }
  flat.sort((a, b) => a.round - b.round || a.order - b.order);

  return { round1: round1Rows, otherRounds: otherRoundsRows, otherRoundNumbers: otherRounds, combined: combinedRows, flat };
}
