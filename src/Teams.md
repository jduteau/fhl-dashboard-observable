---
theme: dashboard
toc: false
---

# Team Management

```js
// Load the data files
const teamCash = await FileAttachment("data/team_cash.csv").csv({typed: true});
const teamInfo = await FileAttachment("data/team_info.csv").csv({typed: true});
const owners = await FileAttachment("data/owners.csv").csv({typed: true});
const contracts = await FileAttachment("data/contracts.csv").csv({typed: true});
const latestRoster = await FileAttachment("data/rosters_p03.csv").csv({typed: true});
const playerInfo = await FileAttachment("data/player_info.csv").csv({typed: true});

// Calculate total salaries per team
const teamSalaries = teamInfo.map(team => {
  const teamRoster = latestRoster.filter(player => player.ABBR === team.ABBR);
  const totalSalary = teamRoster.reduce((sum, player) => {
    const contract = contracts.find(c => c.ID === player.ID);
    return sum + (contract ? (contract.Salary || 0) : 0);
  }, 0);
  
  return {
    ABBR: team.ABBR,
    TOTAL_SALARY: totalSalary
  };
});

// Calculate player counts per team by position
const teamPlayerCounts = teamInfo.map(team => {
  const teamRoster = latestRoster.filter(player => player.ABBR === team.ABBR);
  
  // Count all players by position
  const positionCounts = teamRoster.reduce((counts, player) => {
    // Get player info to determine position
    const playerDetails = playerInfo.find(p => p.ID === player.ID);
    
    if (playerDetails) {
      const pos = playerDetails.Pos;
      if (pos === "G") {
        counts.G++;
      } else if (pos === "D") {
        counts.D++;
      } else {
        counts.F++; // All other positions (C, LW, RW, F, etc.) are forwards
      }
    }
    
    return counts;
  }, { F: 0, D: 0, G: 0 });
  
  // Count active players by position (non-reserve)
  const activePositionCounts = teamRoster
    .filter(player => player.RESERVE !== "R")
    .reduce((counts, player) => {
      const playerDetails = playerInfo.find(p => p.ID === player.ID);
      
      if (playerDetails) {
        const pos = playerDetails.Pos;
        if (pos === "G") {
          counts.G++;
        } else if (pos === "D") {
          counts.D++;
        } else {
          counts.F++;
        }
      }
      
      return counts;
    }, { F: 0, D: 0, G: 0 });
  
  const total = positionCounts.F + positionCounts.D + positionCounts.G;
  const activeTotal = activePositionCounts.F + activePositionCounts.D + activePositionCounts.G;
  const playerCountText = `(${positionCounts.F}/${positionCounts.D}/${positionCounts.G}) ${total}`;
  const activePlayerCountText = `(${activePositionCounts.F}/${activePositionCounts.D}/${activePositionCounts.G}) ${activeTotal}`;
  
  return {
    ABBR: team.ABBR,
    PLAYER_COUNT: playerCountText,
    ACTIVE_PLAYER_COUNT: activePlayerCountText
  };
});

// Combine team info with cash balances and salaries for the first tab
const teamCashData = teamInfo.map(team => {
  const cashInfo = teamCash.find(cash => cash.ABBR === team.ABBR);
  const salaryInfo = teamSalaries.find(salary => salary.ABBR === team.ABBR);
  const playerCountInfo = teamPlayerCounts.find(count => count.ABBR === team.ABBR);
  const totalSalary = salaryInfo ? salaryInfo.TOTAL_SALARY : 0;
  const calculatedSalaryPerPeriod = totalSalary / 25;
  const salaryPerPeriod = Math.max(calculatedSalaryPerPeriod, 13);
  return {
    ABBR: team.ABBR,
    NAME: team.NAME,
    CASH: cashInfo ? cashInfo.CASH : 0,
    TOTAL_SALARY: totalSalary,
    SALARY_PER_PERIOD: salaryPerPeriod,
    PLAYER_COUNT: playerCountInfo ? playerCountInfo.PLAYER_COUNT : "(0/0/0) 0",
    ACTIVE_PLAYER_COUNT: playerCountInfo ? playerCountInfo.ACTIVE_PLAYER_COUNT : "(0/0/0) 0",
    IS_MINIMUM_SALARY: calculatedSalaryPerPeriod < 13
  };
});

// Combine team info with owner information for the second tab
const teamOwnerData = teamInfo.map(team => {
  const ownerInfo = owners.find(owner => owner.ABBR === team.ABBR);
  return {
    ABBR: team.ABBR,
    NAME: team.NAME,
    OWNER: ownerInfo ? ownerInfo.OWNER : "N/A",
    EMAIL: ownerInfo ? ownerInfo.EMAIL : "N/A",
    LOCATION: ownerInfo ? ownerInfo.LOCATION : "N/A"
  };
});
```

<div class="tabs">
  <div class="tab-buttons">
    <button class="tab-button active" onclick="showTab('cash-tab', this)">Team Cash Balances</button>
    <button class="tab-button" onclick="showTab('owner-tab', this)">Team Owners</button>
  </div>
  
  <div id="cash-tab" class="tab-content active">
    <h3>Team Cash Balances</h3>
    ${Inputs.table(teamCashData, {
      columns: [
        "ABBR",
        "NAME", 
        "CASH",
        "TOTAL_SALARY",
        "SALARY_PER_PERIOD",
        "PLAYER_COUNT",
        "ACTIVE_PLAYER_COUNT"
      ],
      header: {
        ABBR: "Team",
        NAME: "Team Name",
        CASH: "Cash Balance ($)",
        TOTAL_SALARY: "Total Salaries ($)",
        SALARY_PER_PERIOD: "Salary per Period ($)",
        PLAYER_COUNT: "Players (F/D/G)",
        ACTIVE_PLAYER_COUNT: "Active (F/D/G)"
      },
      format: {
        CASH: x => x.toLocaleString("en-US", {minimumFractionDigits: 2, maximumFractionDigits: 2}),
        TOTAL_SALARY: x => x.toLocaleString("en-US"),
        SALARY_PER_PERIOD: (x, i, data) => {
          const value = x.toLocaleString("en-US", {minimumFractionDigits: 2, maximumFractionDigits: 2});
          return data[i].IS_MINIMUM_SALARY ? html`<span style="background-color: yellow; padding: 2px 4px;">${value}</span>` : value;
        }
      },
      sort: "NAME",
      rows: 32,
      width: {
        ABBR: 60
      },
      select: false
    })}
  </div>
  
  <div id="owner-tab" class="tab-content">
    <h3>Team Ownership Information</h3>
    ${Inputs.table(teamOwnerData, {
      columns: [
        "ABBR",
        "NAME",
        "OWNER",
        "EMAIL",
        "LOCATION"
      ],
      header: {
        ABBR: "Team",
        NAME: "Team Name",
        OWNER: "Owner",
        EMAIL: "Email",
        LOCATION: "Location"
      },
      sort: "NAME",
      rows: 32,
      width: {
        ABBR: 60
      },
      select: false
    })}
  </div>
</div>

<script>
// JavaScript function to handle tab switching
window.showTab = function(tabId, buttonElement) {
  // Hide all tab contents
  document.querySelectorAll('.tab-content').forEach(tab => {
    tab.classList.remove('active');
  });
  
  // Remove active class from all buttons
  document.querySelectorAll('.tab-button').forEach(button => {
    button.classList.remove('active');
  });
  
  // Show the selected tab and mark button as active
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
.tabs {
  margin: 20px 0;
}

.tab-buttons {
  display: flex;
  border-bottom: 2px solid #e0e0e0;
  margin-bottom: 20px;
}

.tab-button {
  background: none;
  border: none;
  padding: 12px 24px;
  cursor: pointer;
  font-size: 16px;
  font-weight: 500;
  color: #666;
  border-bottom: 3px solid transparent;
  transition: all 0.2s ease;
}

.tab-button:hover {
  color: #333;
  background-color: #f5f5f5;
}

.tab-button.active {
  color: #0066cc;
  border-bottom-color: #0066cc;
  background-color: #f0f8ff;
}

.tab-content {
  display: none;
}

.tab-content.active {
  display: block;
}

.tab-content h3 {
  margin-top: 0;
  color: #333;
  border-bottom: 1px solid #e0e0e0;
  padding-bottom: 8px;
}
</style>
