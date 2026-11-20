---
theme: dashboard
toc: false
---

# My Account

GMs sign in with their team password to change it or to change the email address that trade notifications go to.
Passwords are stored hashed and emails are never shown on the site. **Forgotten your password?** Ask the commissioner to reset it.

```js
import {callAccount} from "./components/trades.js";

const rosters = await FileAttachment("./data/rosters.json").json();
const _params = new URLSearchParams(window.location.search);
const _season = _params.get("season") || rosters.currentSeason;
const teams = rosters.data[_season].teams;
```

```js
const teamSelector = Inputs.select(teams, {label: "Your team:", value: window._fhlTeam});
const currentPw = html`<input type="password" placeholder="Current password" autocomplete="current-password">`;
currentPw.value = window._fhlPw ?? "";
const newPw = html`<input type="password" placeholder="New password (leave blank to keep)" autocomplete="new-password">`;
const newPw2 = html`<input type="password" placeholder="Repeat new password" autocomplete="new-password">`;
const emailInput = html`<input type="text" size="40" placeholder="Email for trade notifications" autocomplete="off">`;
const loadButton = html`<button>Load my details</button>`;
const saveButton = html`<button>Save changes</button>`;
const status = html`<div style="margin:0.5rem 0;"></div>`;
let loadedEmail = null; // what the server had when the details were loaded; null until then

const team = () => teamSelector.value;

loadButton.onclick = async () => {
  status.textContent = "Loading…";
  const r = await callAccount("get", {team: team(), password: currentPw.value});
  if (!r.ok) { status.textContent = `FAILED: ${r.error}`; return; }
  loadedEmail = r.data.email;
  emailInput.value = loadedEmail;
  window._fhlTeam = team();
  window._fhlPw = currentPw.value;
  status.textContent = "Loaded. Change what you need and press Save.";
};

saveButton.onclick = async () => {
  const body = {team: team(), password: currentPw.value};
  if (newPw.value || newPw2.value) {
    if (newPw.value !== newPw2.value) { status.textContent = "The two new passwords don't match."; return; }
    body.newPassword = newPw.value;
  }
  if (loadedEmail !== null && emailInput.value.trim() !== loadedEmail) body.email = emailInput.value.trim();
  if (body.newPassword === undefined && body.email === undefined) {
    status.textContent = loadedEmail === null ? "Press “Load my details” first, or enter a new password." : "Nothing to change.";
    return;
  }
  status.textContent = "Saving…";
  const r = await callAccount("update", body);
  if (!r.ok) { status.textContent = `FAILED: ${r.error}`; return; }
  if (body.newPassword !== undefined) { currentPw.value = body.newPassword; window._fhlPw = body.newPassword; }
  if (body.email !== undefined) loadedEmail = body.email;
  newPw.value = newPw2.value = "";
  status.textContent = `Saved${body.newPassword !== undefined ? " (password changed)" : ""}${body.email !== undefined ? " (email updated)" : ""}.`;
};

display(html`<div style="display:flex; flex-direction:column; gap:0.5rem; max-width:32em;">
  ${teamSelector}
  ${currentPw}
  <div>${loadButton}</div>
  ${emailInput}
  ${newPw}
  ${newPw2}
  <div>${saveButton}</div>
</div>`);
display(status);
```

```js
// Commissioner: reset a forgotten password or fix an email, behind the ADMIN_PASSWORD secret on the Worker.
const adminPassword = html`<input type="password" placeholder="Commissioner password" autocomplete="off">`;
const adminTeam = Inputs.select(teams, {label: "Team:"});
const adminNewPw = html`<input type="text" placeholder="New password (blank = leave)" autocomplete="off">`;
const adminEmail = html`<input type="text" size="40" placeholder="Email (blank = leave; a single space clears it)" autocomplete="off">`;
const adminLoad = html`<button>Show accounts</button>`;
const adminSave = html`<button>Save for this team</button>`;
const adminStatus = html`<div style="margin:0.5rem 0;"></div>`;
const adminList = html`<div></div>`;

adminLoad.onclick = async () => {
  adminStatus.textContent = "Loading…";
  const r = await callAccount("admin-list", {password: adminPassword.value});
  if (!r.ok) { adminStatus.textContent = `FAILED: ${r.error}`; adminList.replaceChildren(); return; }
  const have = new Set(r.data.accounts.map((a) => a.team));
  const missing = teams.filter((t) => !have.has(t));
  adminStatus.textContent = `${r.data.accounts.length} accounts${missing.length ? ` · no account yet: ${missing.join(", ")}` : ""}`;
  adminList.replaceChildren(Inputs.table(r.data.accounts, {
    columns: ["team", "email", "updatedAt"],
    header: {team: "Team", email: "Email", updatedAt: "Last changed"},
    format: {updatedAt: (d) => d ? new Date(d).toLocaleString() : ""},
    select: false
  }));
};

adminSave.onclick = async () => {
  const body = {password: adminPassword.value, team: adminTeam.value};
  if (adminNewPw.value) body.newPassword = adminNewPw.value;
  if (adminEmail.value) body.email = adminEmail.value.trim();
  if (body.newPassword === undefined && body.email === undefined) { adminStatus.textContent = "Nothing to change."; return; }
  adminStatus.textContent = "Saving…";
  const r = await callAccount("admin-set", body);
  adminStatus.textContent = r.ok ? `Saved ${body.team}.` : `FAILED: ${r.error}`;
  if (r.ok) { adminNewPw.value = ""; adminEmail.value = ""; }
};

display(html`<details style="margin-top:1.5rem;"><summary><strong>Commissioner: reset a GM's password or email</strong></summary>
  <div style="display:flex; flex-direction:column; gap:0.5rem; max-width:32em; margin-top:0.5rem;">
    ${adminPassword}
    <div>${adminLoad}</div>
    ${adminTeam}
    ${adminNewPw}
    ${adminEmail}
    <div>${adminSave}</div>
  </div>
  ${adminStatus}${adminList}
</details>`);
```
