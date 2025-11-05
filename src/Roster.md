---
theme: dashboard
toc: false
---

# Team Roster Management

```js
// Load the data files
const teamInfo = await FileAttachment("./data/players.json").json();

const selectedPeriod = teamInfo.availablePeriods[teamInfo.availablePeriods.length-2];

const teamSelector = Inputs.select(teamInfo.teams, {label: "Select Team:"});

const selectedTeam = view(teamSelector);
```

```js
const team = teamInfo.teamData.find((t) => t.ABBR === selectedTeam);
const roster = team[selectedPeriod].ROSTER;
const selection = view(Inputs.table(roster, {
  columns: ["Name", "Position", "Reserve", "NHLTeam"],
  header: {
    Name: "Player Name",
    Position: "Pos",
    Reserve: "R",
    NHLTeam: "NHL"
  },
  format: {
    Reserve: x => x === "R" ? "✓" : ""
  },
  sort: null,
  rows: 50,
  width: {
    NHL: 60,
    Position: 40,
    Reserve: 35
  },
  value: roster.filter((p) => p.Reserve === "R")
}));
```
```js
const promotions = roster.filter((p)=>p.Reserve==="R" && !selection.some((s)=> s.Name === p.Name)).map((player) => `${player.Name}`).join(', ');
const demotions = selection.filter((p)=>p.Reserve !== "R").map((player) => `${player.Name}`).join(', ');
```

<pre>
    ${selectedTeam} Roster Moves
    Promote: ${promotions}
    Demote: ${demotions}
</pre>

<form id="contact-form">

```js
display(html`<input type="hidden" name="name" value="${selectedTeam}"/>`);
display(html`<input type="hidden" name="promote" value="${promotions}"/>`);
display(html`<input type="hidden" name="demote" value="${demotions}"/>`);
display(html`<input type="hidden" name="realpass" value="${team.PW}"/>`);
```
<input type="label" readonly value="Password:"/><input type="password" name="password" required/>
<input type="submit" value="Send Email"/>
</form>

<div id="email-confirmation"></div>

```js
const numForwards = roster.filter((p)=>(p.Position === "F") && !selection.some((s)=>s.Name === p.Name)).length;
const numDefence = roster.filter((p)=>(p.Position === "D") && !selection.some((s)=>s.Name === p.Name)).length;
const numGoalies = roster.filter((p)=>(p.Position === "G") && !selection.some((s)=>s.Name === p.Name)).length;
```

${(numForwards+numDefence+numGoalies > 20 ? "FIX YOUR ROSTER - TOO MANY PLAYERS" : "")}
${(numForwards+numDefence+numGoalies < 20 ? "FIX YOUR ROSTER - NOT ENOUGH PLAYERS" : "")}
${(numDefence < 6 ? "FIX YOUR ROSTER - NOT ENOUGH DEFENCEMEN" : "")}
${(numDefence > 7 ? "FIX YOUR ROSTER - TOO MANY DEFENCEMEN" : "")}

Active Forwards: ${numForwards}

Active Defence: ${numDefence}

Active Goalies: ${numGoalies}

<script type="text/javascript" src="https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js"></script>
<script type="text/javascript">
    (function() {
        // https://dashboard.emailjs.com/admin/account
        emailjs.init({
          publicKey: "m2JaSdtXv7JaHBl7r",
        });
    })();
</script>
<script type="text/javascript">
    window.onload = function() {
        document.getElementById('contact-form').addEventListener('submit', function(event) {
            event.preventDefault();
            (this.realpass.value === this.password.value) ?
              // these IDs from the previous steps
              emailjs.sendForm('service_ladx4fa', 'template_spwr299', this)
                  .then(() => {
                      document.getElementById("email-confirmation").innerHTML = 'SUCCESS!';
                  }, (error) => {
                      document.getElementById("email-confirmation").innerHTML = `FAILED...${error}`;
                  })
            :
              document.getElementById("email-confirmation").innerHTML = 'WRONG PASSWORD'
        });
    }
</script>
