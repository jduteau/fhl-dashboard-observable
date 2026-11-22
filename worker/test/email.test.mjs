import { test } from "node:test";
import assert from "node:assert/strict";
import { buildEmails } from "../email.js";

const owners = [{ ABBR: "ANA", OWNER: "Ann", EMAIL: "a@x.test" }, { ABBR: "BOS", OWNER: "Bob", EMAIL: "b@x.test" }];
const trade = (over = {}) => ({
  from: "ANA", to: "BOS", period: 8, give: { players: ["p1"], picks: [] }, get: { players: [], picks: [{ pick: "BOS1", season: "2026-27" }] }, ...over,
});

test("future considerations appear in every email, including the public league one", () => {
  const t = trade({ considerations: "2nd-round pick if he scores 60", note: "private" });
  for (const event of ["proposed", "accepted", "declined"]) {
    const emails = buildEmails(event, t, owners, new Map(), "", "league@x.test");
    assert.ok(emails.length);
    for (const e of emails) assert.match(e.message, /Future considerations: 2nd-round pick if he scores 60/);
  }
  const league = buildEmails("accepted", t, owners, new Map(), "", "league@x.test").find((e) => e.label === "league");
  assert.doesNotMatch(league.message, /private/);
});

test("no considerations line when none were given", () => {
  assert.doesNotMatch(buildEmails("proposed", trade(), owners, new Map())[0].message, /Future considerations/);
});
