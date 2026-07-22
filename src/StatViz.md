---
theme: dashboard
toc: false
---


```js
// Load the data files
const stats = await FileAttachment("./data/stats.json").json();
const _params = new URLSearchParams(window.location.search);
const _season = _params.get("season") || stats.currentSeason;
const _sd = stats.data[_season];

const teamSelector = Inputs.select(["All", ..._sd.teams], {label: "Select Team:"});
const selectedTeam = Generators.input(teamSelector);

```

<h3>Goal Distribution</h3>
${Plot.plot({
    y: {grid:true}, 
    x: {interval: 1},
    marks: [ 
        Plot.ruleY([0]), 
        Plot.barY(_sd.goalRanges, {x: "goals", y: "playerCount"})
    ]
})}

<h3>Assist Distribution</h3>
${Plot.plot({
    y: {grid:true}, 
    x: {interval: 1},
    marks: [ 
        Plot.ruleY([0]), 
        Plot.barY(_sd.assistRanges, {x: "assists", y: "playerCount"})
    ]
})}

<h3>Toughness Distribution</h3>
${Plot.plot({
    y: {grid:true}, 
    x: {interval: 1},
    marks: [ 
        Plot.ruleY([0]), 
        Plot.barY(_sd.toughnessRanges, {x: "toughness", y: "playerCount"})
    ]
})}

<h3>DStat Distribution</h3>
${Plot.plot({
    y: {grid:true}, 
    x: {interval: 1},
    marks: [ 
        Plot.ruleY([0]), 
        Plot.barY(_sd.dstatRanges, {x: "dstat", y: "playerCount"})
    ]
})}

<h3>GStat Distribution</h3>
${Plot.plot({
    y: {grid:true, interval: 1}, 
    x: {interval: 1},
    marks: [ 
        Plot.ruleY([0]), 
        Plot.barY(_sd.gstatRanges, {x: "gstat", y: "playerCount"})
    ]
})}

${teamSelector}

```js
const allForwards = _sd.contractRanking.filter(s => s.Position ==="F");
const allDefencemen = _sd.contractRanking.filter(s => s.Position ==="D");
const allGoalies = _sd.contractRanking.filter(s => s.Position ==="G");
const forwards = _sd.contractRanking.filter(s => ((selectedTeam === "All") || (s.Team === selectedTeam)) && (s.Position === "F"));
const defencemen = _sd.contractRanking.filter(s => ((selectedTeam === "All") || (s.Team === selectedTeam)) && (s.Position === "D"));
const goalies = _sd.contractRanking.filter(s => ((selectedTeam === "All") || (s.Team === selectedTeam)) && (s.Position === "G"));
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

