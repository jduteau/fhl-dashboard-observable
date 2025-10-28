---
theme: dashboard
toc: false
---


```js
// Load the data files
const stats = await FileAttachment("./data/stats.json").json();
```

<h3>Goal Distribution</h3>
${Plot.plot({
    y: {grid:true}, 
    x: {interval: 1},
    marks: [ 
        Plot.ruleY([0]), 
        Plot.barY(stats.goalRanges, {x: "goals", y: "playerCount"})
    ]
})}

<h3>Assist Distribution</h3>
${Plot.plot({
    y: {grid:true}, 
    x: {interval: 1},
    marks: [ 
        Plot.ruleY([0]), 
        Plot.barY(stats.assistRanges, {x: "assists", y: "playerCount"})
    ]
})}

<h3>Toughness Distribution</h3>
${Plot.plot({
    y: {grid:true}, 
    x: {interval: 1},
    marks: [ 
        Plot.ruleY([0]), 
        Plot.barY(stats.toughnessRanges, {x: "toughness", y: "playerCount"})
    ]
})}

<h3>DStat Distribution</h3>
${Plot.plot({
    y: {grid:true}, 
    x: {interval: 1},
    marks: [ 
        Plot.ruleY([0]), 
        Plot.barY(stats.dstatRanges, {x: "dstat", y: "playerCount"})
    ]
})}

<h3>GStat Distribution</h3>
${Plot.plot({
    y: {grid:true, interval: 1}, 
    x: {interval: 1},
    marks: [ 
        Plot.ruleY([0]), 
        Plot.barY(stats.gstatRanges, {x: "gstat", y: "playerCount"})
    ]
})}

<h3>Forwards Salary vs Rating</h3>
${Plot.dot(
    stats.contractRanking.filter(s => s.Position === "F"),
    { x: "Salary", y: "Rating"}).plot({grid:true})
}

<h3>Defencemen Salary vs Rating</h3>
${Plot.dot(
    stats.contractRanking.filter(s => s.Position === "D"),
    { x: "Salary", y: "Rating"}).plot({grid:true})
}

<h3>Goalies Salary vs Rating</h3>
${Plot.dot(
    stats.contractRanking.filter(s => s.Position === "G"),
    { x: "Salary", y: "Rating"}).plot({grid:true})
}

