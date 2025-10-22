---
theme: dashboard
toc: false
---

# Team Management

```js
// Load the data files
const teamInfo = await FileAttachment("./data/teams.json").json();
```
<div class="tabs">
  <div class="tab-buttons">
    <button class="tab-button active" onclick="showTab('cash-tab', this)">Team Cash Balances</button>
    <button class="tab-button" onclick="showTab('owner-tab', this)">Team Owners</button>
  </div>
  
  <div id="cash-tab" class="tab-content active">
    ${Inputs.table(teamInfo.teams, {
      columns: [
        "ABBR",
        "NAME", 
        "CASH",
        "LatestSalary",
        "SalaryPerPeriod",
        "TotalPlayerCount",
        "ActivePlayerCount"
      ],
      header: {
        ABBR: "Team",
        NAME: "Team Name",
        CASH: "Cash Balance ($)",
        LatestSalary: "Total Salaries ($)",
        SalaryPerPeriod: "Salary per Period ($)",
        TotalPlayerCount: "Players (F/D/G)",
        ActivePlayerCount: "Active (F/D/G)"
      },
      format: {
        CASH: x => x.toLocaleString("en-US", {minimumFractionDigits: 2, maximumFractionDigits: 2}),
        LatestSalary: x => x.toLocaleString("en-US"),
        SalaryPerPeriod: (x, i, data) => {
          const value = x.toLocaleString("en-US", {minimumFractionDigits: 2, maximumFractionDigits: 2});
          return x < 13 ? html`<span style="background-color: yellow;">13.00</span>` : value;
        }
      },
      sort: "ABBR",
      rows: 32,
      width: {
        ABBR: 60
      },
      select: false
    })}
  </div>
  
  <div id="owner-tab" class="tab-content">
    ${Inputs.table(teamInfo.teams, {
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
