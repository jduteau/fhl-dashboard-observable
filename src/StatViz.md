---
theme: dashboard
toc: false
---


```js
// Load the data files
const stats = await FileAttachment("./data/stats.json").json();
```

${Plot.plot({
    y: {grid:true}, 
    x: {interval: 1},
    marks: [ 
        Plot.ruleY([0]), 
        Plot.barY(stats.goalRanges, {x: "goals", y: "playerCount"})
    ]
})}

${Plot.plot({
    y: {grid:true}, 
    x: {interval: 1},
    marks: [ 
        Plot.ruleY([0]), 
        Plot.barY(stats.assistRanges, {x: "assists", y: "playerCount"})
    ]
})}

${Plot.plot({
    y: {grid:true}, 
    x: {interval: 1},
    marks: [ 
        Plot.ruleY([0]), 
        Plot.barY(stats.toughnessRanges, {x: "toughness", y: "playerCount"})
    ]
})}

${Plot.plot({
    y: {grid:true}, 
    x: {interval: 1},
    marks: [ 
        Plot.ruleY([0]), 
        Plot.barY(stats.dstatRanges, {x: "dstat", y: "playerCount"})
    ]
})}

${Plot.plot({
    y: {grid:true, interval: 1}, 
    x: {interval: 1},
    marks: [ 
        Plot.ruleY([0]), 
        Plot.barY(stats.gstatRanges, {x: "gstat", y: "playerCount"})
    ]
})}
