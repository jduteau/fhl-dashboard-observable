
```js
// Load the data files
const stats = await FileAttachment("./data/stats.json").json();
```

${Plot.barY(stats.goalRanges, {x: "goals", y: "playerCount"}).plot()}

${Plot.barY(stats.assistRanges, {x: "assists", y: "playerCount"}).plot()}

${Plot.barY(stats.toughnessRanges, {x: "toughness", y: "playerCount"}).plot()}

${Plot.barY(stats.dstatRanges, {x: "dstat", y: "playerCount"}).plot()}