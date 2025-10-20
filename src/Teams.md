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

// Combine team info with cash balances for the first tab
const teamCashData = teamInfo.map(team => {
  const cashInfo = teamCash.find(cash => cash.ABBR === team.ABBR);
  return {
    ABBR: team.ABBR,
    NAME: team.NAME,
    CASH: cashInfo ? cashInfo.CASH : 0
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
        "CASH"
      ],
      header: {
        ABBR: "Team",
        NAME: "Team Name",
        CASH: "Cash Balance ($)"
      },
      format: {
        CASH: x => x.toLocaleString("en-US", {minimumFractionDigits: 2, maximumFractionDigits: 2})
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
