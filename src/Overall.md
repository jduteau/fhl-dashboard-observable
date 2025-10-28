---
toc: false
---

# Overall Player Statistics

```js
// Load the data files
const playerInfo = await FileAttachment("./data/allplayers.json").json();

const teamSelector = Inputs.select(playerInfo.teams, {label: "Select Team:"});
const selectedTeam = Generators.input(teamSelector);
```

${teamSelector}

<div class="tab-content">
${Inputs.table(playerInfo.playerData.filter((p) => selectedTeam === "All" || p.FHL === selectedTeam), {
    columns: ["Name", "Position", "FHL", "GamesPlayed", "Goals", "Assists", "PIM", "Hits", "Toughness", "Blocks", "Take", "Give", "TOI", "DStat", "Record", "SO", "GA", "SA", "GStat", "Rating", "NHLTeam"],
    header: {
    Name: "Player Name",
    Position: "Pos",
    Goals: "G",
    Assists: "A",
    PIM: "PIM",
    Hits: "Hits",
    Toughness: "TGH",
    Blocks: "Blks",
    Take: "Take",
    Give: "Give",
    TOI: "TOI",
    DStat: "DStat",
    Record: "Record",
    SO: "SO",
    GA: "GA",
    SA: "SA",
    GStat: "GStat", 
    GamesPlayed: "GP",
    NHLTeam: "NHL",
    Rating: "Rate"
    },
    format: {
    Goals: x => x !== null ? x : "",
    Assists: x => x !== null ? x : "",
    Toughness: x => x !== null ? x : "",
    PIM: x => x !== null ? x : "",
    Hits:  x => x !== null ? x : "",
    Blocks:  x => x !== null ? x : "",
    Take:  x => x !== null ? x : "",
    Give:  x => x !== null ? x : "",
    TOI:  x => x !== null ? x : "",
    Record:   x => x !== null ? x : "",
    SO:  x => x !== null ? x : "",
    GA:  x => x !== null ? x : "",
    SA:  x => x !== null ? x : "",
    DStat: x => x !== null ? x.toFixed(2) : "",
    GStat: x => x !== null ? x.toFixed(2) : "",
    Rating: x => x.toFixed(0)
    },
    width: {
    Position: 40,
    Reserve: 20,
    Goals: 40,
    Assists: 40,
    PIM: 40,
    Hits: 40,
    Toughness: 40,
    Blocks: 40,
    Take: 40,
    Give: 40,
    TOI: 70,
    DStat: 70,
    Record: 70,
    SO: 40,
    GA: 50,
    SA: 60,
    GStat: 70,
    GamesPlayed: 40,
    NHLTeam: 40,
    Rating: 40
    },
    rows: 50,
    sort: "Rating",
    reverse: true,
    select: false
})}
</div>

