---
theme: dashboard
toc: false
---


```js
// Load the data files
const stats = await FileAttachment("./data/stats.json").json();

const teamSelector = Inputs.select(["All", ...stats.teams], {label: "Select Team:"});
const selectedTeam = Generators.input(teamSelector);

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

${teamSelector}

```js
const allForwards = stats.contractRanking.filter(s => s.Position ==="F");
const allDefencemen = stats.contractRanking.filter(s => s.Position ==="D");
const allGoalies = stats.contractRanking.filter(s => s.Position ==="G");
const forwards = stats.contractRanking.filter(s => ((selectedTeam === "All") || (s.Team === selectedTeam)) && (s.Position === "F"));
const defencemen = stats.contractRanking.filter(s => ((selectedTeam === "All") || (s.Team === selectedTeam)) && (s.Position === "D"));
const goalies = stats.contractRanking.filter(s => ((selectedTeam === "All") || (s.Team === selectedTeam)) && (s.Position === "G"));
```

<h3>Forwards Salary vs Rating</h3>
${Plot.plot({
  marks: [
    Plot.ruleY([0,50,100]),
    Plot.dot(forwards, { x: "Salary", y: "Rating"}),
    Plot.linearRegressionY(forwards, {x: "Salary", y: "Rating", stroke: "red"}),
    Plot.linearRegressionY(allForwards, {x: "Salary", y: "Rating", stroke: "blue"}),
    Plot.tip(forwards, Plot.pointer({ x: "Salary", y: "Rating", title: (d) => d.Name }))
  ]
})}

<h3>Defencemen Salary vs Rating</h3>
${Plot.plot({
  marks: [
    Plot.ruleY([0,50,100]),
    Plot.dot(defencemen, { x: "Salary", y: "Rating"}),
    Plot.linearRegressionY(defencemen, {x: "Salary", y: "Rating", stroke: "red"}),
    Plot.linearRegressionY(allDefencemen, {x: "Salary", y: "Rating", stroke: "blue"}),
    Plot.tip(defencemen, Plot.pointer({ x: "Salary", y: "Rating", title: (d) => d.Name }))
  ]
})}

<h3>Goalies Salary vs Rating</h3>
${
  (selectedTeam === "All") ?
    Plot.plot({
    marks: [
      Plot.ruleY([0,50,100]),
      Plot.dot(goalies, { x: "Salary", y: "Rating"}),
      Plot.linearRegressionY(goalies, {x: "Salary", y: "Rating", stroke: "red"}),
      Plot.linearRegressionY(allGoalies, {x: "Salary", y: "Rating", stroke: "blue"}),
      Plot.tip(goalies, Plot.pointer({ x: "Salary", y: "Rating", title: (d) => d.Name })),
    ]
  }) :
    Plot.plot({
    marks: [
      Plot.ruleY([0,50,100]),
      Plot.dot(goalies, { x: "Salary", y: "Rating"}),
      Plot.linearRegressionY(allGoalies, {x: "Salary", y: "Rating", stroke: "blue"}),
      Plot.tip(goalies, Plot.pointer({ x: "Salary", y: "Rating", title: (d) => d.Name })),
    ]
  })
}

