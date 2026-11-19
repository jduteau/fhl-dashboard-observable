// Trade emails, sent through EmailJS (https://www.emailjs.com/docs/rest-api/send/) from the Worker.
// Everything here is best-effort: a failed or unconfigured email never affects a trade.
import { csvParse, ghFile } from "./lib.js";

const EMAILJS_URL = "https://api.emailjs.com/api/v1.0/email/send";

export const emailConfigured = (env) =>
  Boolean(env.EMAILJS_SERVICE_ID && env.EMAILJS_TEMPLATE_ID && env.EMAILJS_PUBLIC_KEY && env.EMAILJS_PRIVATE_KEY);

// A single plain address (no names, lists or whitespace). EmailJS answers "recipients address is corrupted" otherwise.
const VALID_ADDRESS = /^[^\s@,;<>()"]+@[^\s@,;<>()"]+\.[^\s@,;<>()"]+$/;

// Sends one email through the shared EmailJS template, which has the variables
// {{to_email}} {{to_name}} {{subject}} {{message}}. Resolves to true if EmailJS accepted it.
// `label` names the recipient in the logs (a team abbreviation or "league"); addresses are never logged.
export async function sendEmail(env, { to, toName, subject, message, label = "recipient" }) {
  if (!emailConfigured(env) || !to) return false;
  if (!VALID_ADDRESS.test(to)) {
    console.error(`Not emailing ${label}: the address on file is not a single valid email address`);
    return false;
  }
  try {
    const res = await fetch(EMAILJS_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        service_id: env.EMAILJS_SERVICE_ID,
        template_id: env.EMAILJS_TEMPLATE_ID,
        user_id: env.EMAILJS_PUBLIC_KEY,
        accessToken: env.EMAILJS_PRIVATE_KEY, // required for server-side calls
        template_params: { to_email: to, to_name: toName, subject, message },
      }),
    });
    if (!res.ok) {
      console.error(`EmailJS rejected an email to ${label} (HTTP ${res.status}): ${(await res.text()).slice(0, 200)}`);
      return false;
    }
    return true;
  } catch (e) {
    console.error(`EmailJS request failed for ${label}: ${e.message}`);
    return false;
  }
}

// ---- Message content (pure; see worker/test) ----------------------------------------------

const bullets = (lines) => (lines.length ? lines.map((l) => `  - ${l}`).join("\n") : "  (nothing)");
const describeSide = (side, names) => [
  ...side.players.map((id) => names.get(id) ?? id),
  ...side.picks.map((p) => `${p.pick} (${p.season})`),
];

// trade = {from, to, period, note?, give, get}; `give` is what `from` sends, `get` what `to` sends.
function tradeBlock(trade, names) {
  return `${trade.from} sends:\n${bullets(describeSide(trade.give, names))}\n\n${trade.to} sends:\n${bullets(describeSide(trade.get, names))}`;
}

// The emails to send for an event, as [{to, toName, subject, message}].
//   event: "proposed" | "countered" | "accepted" | "declined" | "withdrawn"
//   owners: owners.csv rows ({ABBR, OWNER, EMAIL}); names: Map(playerId -> name); siteUrl: dashboard base URL;
//   leagueEmail: league-wide address that is also told about accepted trades (optional)
// Private notes only ever go to the other GM in the trade. Passwords are never included.
export function buildEmails(event, trade, owners, names, siteUrl = "", leagueEmail = "") {
  const base = siteUrl.replace(/\/+$/, "");
  const link = (page) => (base ? `\n${base}/${page}\n` : "");
  const owner = (abbr) => owners.find((o) => o.ABBR === abbr);
  const block = tradeBlock(trade, names);
  const note = trade.note ? `\nNote from ${trade.from}: "${trade.note}"\n` : "";

  const mail = (toAbbr, subject, body) => {
    const o = owner(toAbbr);
    return o?.EMAIL ? [{ to: o.EMAIL.trim(), toName: o.OWNER, label: toAbbr, subject, message: `Hello ${o.OWNER},\n\n${body}\n\n- FHL Dashboard` }] : [];
  };

  switch (event) {
    case "proposed":
      return mail(trade.to, `FHL trade proposal from ${trade.from}`,
        `${trade.from} has proposed a trade to ${trade.to}, taking effect in period ${trade.period}:\n\n${block}\n${note}\n` +
        `The trade only happens if you accept. You can accept, decline or counter it on the Trades page:${link("Trades")}\n` +
        `An unanswered proposal expires when period ${trade.period} starts.`);
    case "countered":
      return mail(trade.to, `FHL counter-offer from ${trade.from}`,
        `${trade.from} has answered your proposal with a counter-offer, taking effect in period ${trade.period}. It replaces your earlier proposal:\n\n${block}\n${note}\n` +
        `You can accept, decline or counter it on the Trades page:${link("Trades")}`);
    case "accepted": {
      const body =
        `The trade between ${trade.from} and ${trade.to} has been agreed by both GMs:\n\n${block}\n\n` +
        `It takes effect in the rosters for period ${trade.period}. Players you receive keep their current active/reserve status, ` +
        `so please check your lineup for period ${trade.period} on the Roster page (Next Period tab), which already includes this trade:${link("Roster")}`;
      // The whole league is told too (one email to the league address). It carries no lineup advice and no private note.
      const who = (abbr) => `${abbr}${owner(abbr)?.OWNER ? ` (${owner(abbr).OWNER})` : ""}`;
      const league = leagueEmail ? [{
        to: leagueEmail.trim(), toName: "FHL League", label: "league", subject: `FHL trade: ${trade.from} and ${trade.to}`,
        message: `Trade agreed between ${who(trade.from)} and ${who(trade.to)}, taking effect in period ${trade.period}:\n\n${block}\n\n` +
          `All agreed trades are listed on the Trades page:${link("Trades")}\n- FHL Dashboard`,
      }] : [];
      return [...mail(trade.from, `FHL trade agreed with ${trade.to}`, body), ...mail(trade.to, `FHL trade agreed with ${trade.from}`, body), ...league];
    }
    case "declined":
      return mail(trade.from, `FHL trade declined by ${trade.to}`,
        `${trade.to} has declined your trade proposal:\n\n${block}\n\nYou can see your trades on the Trades page:${link("Trades")}`);
    case "withdrawn":
      return mail(trade.to, `FHL trade withdrawn by ${trade.from}`,
        `${trade.from} has withdrawn their trade proposal to you:\n\n${block}\n\nNothing further is needed.`);
    default:
      return [];
  }
}

// ---- Sending ------------------------------------------------------------------------------

async function playerNames(env, season) {
  try {
    const text = await ghFile(env, `src/data/static/${season}/player_info.csv`);
    return new Map((text ? csvParse(text) : []).map((r) => [r.ID, r.Name]));
  } catch {
    return new Map(); // fall back to player ids rather than not telling anyone
  }
}

// Returns mail(event, trade) for one request. Sending happens after the response is sent (execCtx.waitUntil) when
// the platform provides it, so it never slows down or breaks the trade action.
export function makeMailer(env, owners, execCtx) {
  return async function mail(event, trade) {
    if (!emailConfigured(env)) return;
    const job = (async () => {
      try {
        const emails = buildEmails(event, trade, owners, await playerNames(env, trade.season), env.SITE_URL ?? "", env.LEAGUE_EMAIL ?? "");
        await Promise.all(emails.map((e) => sendEmail(env, e)));
      } catch (e) {
        console.error(`Could not send ${event} emails: ${e.message}`);
      }
    })();
    if (execCtx?.waitUntil) execCtx.waitUntil(job);
    else await job;
  };
}
