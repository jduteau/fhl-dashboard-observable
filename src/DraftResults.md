---
theme: dashboard
toc: false
---

# Draft Results

```js
const draftResults = await FileAttachment("./data/draftResults.json").json();
const _params = new URLSearchParams(window.location.search);
const _season = _params.get("season") || draftResults.currentSeason;
const _drSd = draftResults.data[_season] ?? { sourceSeason: null, results: [] };
```

```js
if (_drSd.sourceSeason === null) {
  display(html`<div style="text-align: center; padding: 40px; background: #f8f9fa; border-radius: 8px; color: #666;">
    <h3>Draft Results Not Available</h3>
    <p>There's no prior season on record to pull the draft order and pick ownership from.</p>
  </div>`);
} else {
  display(Inputs.table(_drSd.results, {
    columns: [
      "round",
      "order",
      "teamLabel",
      "player",
      "playerNHLTeam",
      "playerPosition"
    ],
    header: {
      round: "Round",
      order: "Pick #",
      teamLabel: "Team",
      player: "Player",
      playerNHLTeam: "NHL Team",
      playerPosition: "Pos"
    },
    format: {
      player: x => x ?? "—",
      playerNHLTeam: x => x ?? "—",
      playerPosition: x => x ?? "—"
    },
    width: {
      round: 60,
      order: 70,
      teamLabel: 100,
      playerNHLTeam: 70,
      playerPosition: 50
    },
    rows: 32,
    select: false
  }));
}
```
