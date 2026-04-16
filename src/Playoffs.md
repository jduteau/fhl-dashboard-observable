---
theme: dashboard
toc: false
---

# Playoffs

```js
const playoffData = await FileAttachment("./data/playoffs.json").json();
```

```js
// Check if there's any playoff data - if not, show no data message and exit
if (playoffData.availableRounds.length === 0) {
  display(html`<div style="text-align: center; padding: 40px; background: #f8f9fa; border-radius: 8px; color: #666;">
    <h3>No Playoff Data Available</h3>
    <p>Playoff statistics files (stats_playoff_r01.csv through stats_playoff_r04.csv) are not yet available.</p>
    <p>Run the playoff stats script to generate playoff data.</p>
  </div>`);
} else {
  // Create main tabs for each round with sub-tabs for matchups/rankings
  display(html`<div class="main-tabs">
    <div class="main-tab-buttons">
      ${playoffData.availableRounds.map((round, index) => 
        html`<button class="main-tab-button${index === 0 ? ' active' : ''}" onclick="showMainTab('round-${round}-main-tab', this)">
          ${playoffData.roundNames[round]}
        </button>`
      )}
    </div>
    
    ${playoffData.availableRounds.map((round, roundIndex) => {
      const roundData = playoffData.data[round];
      if (!roundData || !roundData.matchups) return html``;
      
      // Extract teams from matchups for rankings
      const teams = [];
      roundData.matchups.forEach(matchup => {
        if (matchup.team1 && matchup.team1.abbr) {
          teams.push({
            overallRank: matchup.team1.rankings.total,
            team: matchup.team1.abbr,
            teamName: matchup.team1.name,
            goals: matchup.team1.goals,
            goalsRank: matchup.team1.rankings.goals,
            assists: matchup.team1.assists,
            assistsRank: matchup.team1.rankings.assists,
            toughness: matchup.team1.toughness,
            toughnessRank: matchup.team1.rankings.toughness,
            dstat: matchup.team1.dstat,
            dstatRank: matchup.team1.rankings.dstat,
            gstat: matchup.team1.gstat,
            gstatRank: matchup.team1.rankings.gstat,
            overall: matchup.team1.rankings.goals + matchup.team1.rankings.assists + matchup.team1.rankings.toughness + matchup.team1.rankings.dstat + matchup.team1.rankings.gstat
          });
        }
        if (matchup.team2 && matchup.team2.abbr) {
          teams.push({
            overallRank: matchup.team2.rankings.total,
            team: matchup.team2.abbr,
            teamName: matchup.team2.name,
            goals: matchup.team2.goals,
            goalsRank: matchup.team2.rankings.goals,
            assists: matchup.team2.assists,
            assistsRank: matchup.team2.rankings.assists,
            toughness: matchup.team2.toughness,
            toughnessRank: matchup.team2.rankings.toughness,
            dstat: matchup.team2.dstat,
            dstatRank: matchup.team2.rankings.dstat,
            gstat: matchup.team2.gstat,
            gstatRank: matchup.team2.rankings.gstat,
            overall: matchup.team2.rankings.goals + matchup.team2.rankings.assists + matchup.team2.rankings.toughness + matchup.team2.rankings.dstat + matchup.team2.rankings.gstat
          });
        }
      });
      
      const rankingsData = teams.sort((a, b) => a.overallRank - b.overallRank);
      
      return html`<div id="round-${round}-main-tab" class="main-tab-content${roundIndex === 0 ? ' active' : ''}">
        <div class="sub-tabs">
          <div class="sub-tab-buttons">
            <button class="sub-tab-button active" onclick="showSubTab('round-${round}-matchups-tab', this)">Matchups</button>
            <button class="sub-tab-button" onclick="showSubTab('round-${round}-rankings-tab', this)">Rankings</button>
          </div>
          
          <div class="sub-tab-content-container">
            <div id="round-${round}-matchups-tab" class="sub-tab-content active">
              ${roundData.matchups.map(matchup => {
                if (!matchup.team1 || !matchup.team2) {
                  return html`<p><strong>Matchup ${matchup.matchup}:</strong> TBD vs TBD</p>`;
                }
                
                const team1Rankings = matchup.team1.rankings || {};
                const team2Rankings = matchup.team2.rankings || {};
                
                return html`<div style="margin-bottom: 30px;">
                  <h4>Matchup ${matchup.matchup}: ${matchup.team1.name} vs ${matchup.team2.name}</h4>
                  <table style="width: 100%; border-collapse: collapse; margin-top: 10px;">
                    <thead>
                      <tr style="background: #f8f9fa;">
                        <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Team</th>
                        <th style="border: 1px solid #ddd; padding: 8px; text-align: center;">Goals Rank</th>
                        <th style="border: 1px solid #ddd; padding: 8px; text-align: center;">Assists Rank</th>
                        <th style="border: 1px solid #ddd; padding: 8px; text-align: center;">Toughness Rank</th>
                        <th style="border: 1px solid #ddd; padding: 8px; text-align: center;">D-Stat Rank</th>
                        <th style="border: 1px solid #ddd; padding: 8px; text-align: center;">G-Stat Rank</th>
                        <th style="border: 1px solid #ddd; padding: 8px; text-align: center;">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td style="border: 1px solid #ddd; padding: 8px; font-weight: bold;">${matchup.team1.abbr}</td>
                        <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">${team1Rankings.goals || 'N/A'}</td>
                        <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">${team1Rankings.assists || 'N/A'}</td>
                        <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">${team1Rankings.toughness || 'N/A'}</td>
                        <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">${team1Rankings.dstat || 'N/A'}</td>
                        <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">${team1Rankings.gstat || 'N/A'}</td>
                        <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">${(team1Rankings.goals || 0) + (team1Rankings.assists || 0) + (team1Rankings.toughness || 0) + (team1Rankings.dstat || 0) + (team1Rankings.gstat || 0)}</td>
                      </tr>
                      <tr>
                        <td style="border: 1px solid #ddd; padding: 8px; font-weight: bold;">${matchup.team2.abbr}</td>
                        <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">${team2Rankings.goals || 'N/A'}</td>
                        <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">${team2Rankings.assists || 'N/A'}</td>
                        <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">${team2Rankings.toughness || 'N/A'}</td>
                        <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">${team2Rankings.dstat || 'N/A'}</td>
                        <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">${team2Rankings.gstat || 'N/A'}</td>
                        <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">${(team2Rankings.goals || 0) + (team2Rankings.assists || 0) + (team2Rankings.toughness || 0) + (team2Rankings.dstat || 0) + (team2Rankings.gstat || 0)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>`;
              })}
            </div>
            
            <div id="round-${round}-rankings-tab" class="sub-tab-content">
              ${Inputs.table(rankingsData, {
                columns: [
                  "overallRank",
                  "team",
                  "goals",
                  "goalsRank",
                  "assists",
                  "assistsRank",
                  "toughness", 
                  "toughnessRank",
                  "dstat",
                  "dstatRank",
                  "gstat",
                  "gstatRank",
                  "overall"
                ],
                header: {
                  overallRank: "Rank",
                  team: "Team",
                  goals: "Goals",
                  goalsRank: "GRank",
                  assists: "Assists",
                  assistsRank: "ARank",
                  toughness: "Toughness",
                  toughnessRank: "TRank",
                  dstat: "D-Stat",
                  dstatRank: "DRank",
                  gstat: "G-Stat",
                  gstatRank: "GSRank",
                  overall: "Total"
                },
                format: {
                  goals: x => x.toLocaleString("en-US"),
                  assists: x => x.toLocaleString("en-US"),
                  toughness: x => x.toLocaleString("en-US"),
                  dstat: x => x.toFixed(4),
                  gstat: x => x.toFixed(2)
                },
                sort: "overallRank",
                reverse: false,
                width: {
                  overallRank: 30,
                  team: 30,
                  goals: 50,
                  goalsRank: 30,
                  assists: 50,
                  assistsRank: 30,
                  toughness: 50,
                  toughnessRank: 30,
                  dstat: 50,
                  dstatRank: 30,
                  gstat: 50,
                  gstatRank: 30,
                  overall: 30
                },
                select: false
              })}
            </div>
          </div>
        </div>
      </div>`;
    })}
  </div>`);
}
```

<script>
// JavaScript functions to handle tab switching
window.showMainTab = function(tabId, buttonElement) {
  // Hide all main tab contents
  document.querySelectorAll('.main-tab-content').forEach(tab => {
    tab.classList.remove('active');
  });
  
  // Remove active class from all main buttons
  document.querySelectorAll('.main-tab-button').forEach(button => {
    button.classList.remove('active');
  });
  
  // Show the selected main tab and mark button as active
  const targetTab = document.getElementById(tabId);
  if (targetTab) {
    targetTab.classList.add('active');
    
    // Activate the first sub-tab in the newly shown main tab
    const firstSubTab = targetTab.querySelector('.sub-tab-content');
    const firstSubButton = targetTab.querySelector('.sub-tab-button');
    
    // Hide all sub-tab contents within this main tab
    targetTab.querySelectorAll('.sub-tab-content').forEach(subTab => {
      subTab.classList.remove('active');
    });
    
    // Remove active class from all sub-tab buttons within this main tab
    targetTab.querySelectorAll('.sub-tab-button').forEach(subButton => {
      subButton.classList.remove('active');
    });
    
    // Activate the first sub-tab and button
    if (firstSubTab) {
      firstSubTab.classList.add('active');
    }
    if (firstSubButton) {
      firstSubButton.classList.add('active');
    }
  }
  if (buttonElement) {
    buttonElement.classList.add('active');
  }
}

window.showSubTab = function(tabId, buttonElement) {
  // Hide all sub tab contents
  document.querySelectorAll('.sub-tab-content').forEach(tab => {
    tab.classList.remove('active');
  });
  
  // Remove active class from all sub buttons
  document.querySelectorAll('.sub-tab-button').forEach(button => {
    button.classList.remove('active');
  });
  
  // Show the selected sub tab and mark button as active
  const targetTab = document.getElementById(tabId);
  if (targetTab) {
    targetTab.classList.add('active');
  }
  if (buttonElement) {
    buttonElement.classList.add('active');
  }
}
</script>

<style>
/* Main tabs */
.main-tabs {
  margin: 20px 0;
}

.main-tab-buttons {
  display: flex;
  border-bottom: 3px solid #e0e0e0;
  margin-bottom: 20px;
}

.main-tab-button {
  background: none;
  border: none;
  padding: 15px 30px;
  cursor: pointer;
  font-size: 18px;
  font-weight: 600;
  color: #666;
  border-bottom: 4px solid transparent;
  transition: all 0.2s ease;
}

.main-tab-button:hover {
  color: #333;
  background-color: #f5f5f5;
}

.main-tab-button.active {
  color: #0066cc;
  border-bottom-color: #0066cc;
  background-color: #f0f8ff;
}

.main-tab-content {
  display: none;
}

.main-tab-content.active {
  display: block;
}

/* Sub tabs (round tabs) */
.sub-tabs {
  margin: 10px 0;
}

.sub-tab-buttons {
  display: flex;
  border-bottom: 2px solid #ddd;
  margin-bottom: 15px;
}

.sub-tab-button {
  background: none;
  border: none;
  padding: 10px 20px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  color: #777;
  border-bottom: 3px solid transparent;
  transition: all 0.2s ease;
}

.sub-tab-button:hover {
  color: #333;
  background-color: #f8f9fa;
}

.sub-tab-button.active {
  color: #0066cc;
  border-bottom-color: #0066cc;
  background-color: #f0f8ff;
}

.sub-tab-content {
  display: none;
}

.sub-tab-content.active {
  display: block;
}

.sub-tab-content h3 {
  margin-top: 0;
  color: #333;
  border-bottom: 1px solid #e0e0e0;
  padding-bottom: 8px;
}
</style>