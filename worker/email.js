// Trade emails, sent through EmailJS (https://www.emailjs.com/docs/rest-api/send/) from the Worker.
// Everything here is best-effort: a failed or unconfigured email never affects a trade.
import { csvParse, ghFile } from "./lib.js";

const EMAILJS_URL = "https://api.emailjs.com/api/v1.0/email/send";

export const emailConfigured = (env) =>
  Boolean(env.EMAILJS_SERVICE_ID && env.EMAILJS_TEMPLATE_ID && env.EMAILJS_PUBLIC_KEY && env.EMAILJS_PRIVATE_KEY);

// A plain address (no display names or whitespace). EmailJS answers "recipients address is corrupted" otherwise.
const VALID_ADDRESS = /^[^\s@,;<>()"]+@[^\s@,;<>()"]+\.[^\s@,;<>()"]+$/;

// Several recipients may share one cell (owners.csv EMAIL, LEAGUE_EMAIL), separated by commas or semicolons.
// Returns {good, bad}: the valid addresses joined with commas (what EmailJS expects, or "" if none) and how many were invalid.
export function normalizeRecipients(to) {
  const list = String(to ?? "").split(/[,;]/).map((a) => a.trim()).filter(Boolean);
  const good = list.filter((a) => VALID_ADDRESS.test(a));
  return { good: good.join(","), bad: list.length - good.length };
}

// Sends one email through the shared EmailJS template, which has the variables
// {{to_email}} {{to_name}} {{subject}} {{message}}. Resolves to true if EmailJS accepted it.
// `label` names the recipient in the logs (a team abbreviation or "league"); addresses are never logged.
export async function sendEmail(env, { to, toName, subject, message, label = "recipient" }) {
  if (!emailConfigured(env) || !to) return false;
  const { good: recipients, bad } = normalizeRecipients(to);
  if (bad) console.error(`Skipping ${bad} invalid email address(es) for ${label}`);
  if (!recipients) {
    console.error(`Not emailing ${label}: no valid email address on file`);
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
        template_params: { to_email: recipients, to_name: toName, subject, message },
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

// Posts a message to a Discord channel through its webhook (DISCORD_WEBHOOK_URL secret). Best-effort like email.
export async function sendDiscord(env, content) {
  if (!env.DISCORD_WEBHOOK_URL) return false;
  try {
    // allowed_mentions: none, so a note or name can never ping @everyone
    const res = await fetch(env.DISCORD_WEBHOOK_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: content.slice(0, 2000), allowed_mentions: { parse: [] } }),
    });
    if (!res.ok) {
      console.error(`Discord rejected the trade post (HTTP ${res.status}): ${(await res.text()).slice(0, 200)}`);
      return false;
    }
    return true;
  } catch (e) {
    console.error(`Discord request failed: ${e.message}`);
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

  // One email addressed to both GMs of the trade (those with an address on file).
  const mail = (subject, body) => {
    const gms = [trade.from, trade.to].map(owner).filter((o) => o?.EMAIL?.trim());
    if (!gms.length) return [];
    const names = gms.map((o) => o.OWNER).join(" and ");
    return [{ to: gms.map((o) => o.EMAIL.trim()).join(","), toName: names, label: `${trade.from}/${trade.to}`, subject, message: `Hello ${names},\n\n${body}\n\n- FHL Dashboard` }];
  };

  switch (event) {
    case "proposed":
      return mail(`FHL trade proposal: ${trade.from} to ${trade.to}`,
        `${trade.from} has proposed a trade to ${trade.to}, taking effect in period ${trade.period}:\n\n${block}\n${note}\n` +
        `The trade only happens if ${trade.to} accepts. ${trade.to} can accept, decline or counter it on the Trades page:${link("Trades")}\n` +
        `An unanswered proposal expires when period ${trade.period} starts.`);
    case "countered":
      return mail(`FHL counter-offer: ${trade.from} to ${trade.to}`,
        `${trade.from} has answered a proposal with a counter-offer to ${trade.to}, taking effect in period ${trade.period}. It replaces the earlier proposal:\n\n${block}\n${note}\n` +
        `${trade.to} can accept, decline or counter it on the Trades page:${link("Trades")}`);
    case "accepted": {
      const body =
        `The trade between ${trade.from} and ${trade.to} has been agreed by both GMs:\n\n${block}\n\n` +
        `It takes effect in the rosters for period ${trade.period}. Players you receive keep their current active/reserve status, ` +
        `so please check your lineup for period ${trade.period} on the Roster page (Next Period tab), which already includes this trade:${link("Roster")}`;
      // The whole league is told too (one email to the league address). It carries no lineup advice and no private note.
      const who = (abbr) => `${abbr}${owner(abbr)?.OWNER ? ` (${owner(abbr).OWNER})` : ""}`;
      const league = [{
        to: leagueEmail.trim(), toName: "FHL League", label: "league", subject: `FHL trade: ${trade.from} and ${trade.to}`,
        message: `Trade agreed between ${who(trade.from)} and ${who(trade.to)}, taking effect in period ${trade.period}:\n\n${block}\n\n` +
          `All agreed trades are listed on the Trades page:${link("Trades")}\n- FHL Dashboard`,
      }]; // no `to` when LEAGUE_EMAIL is unset: sendEmail skips it, but the Discord post still uses its text
      return [...mail(`FHL trade agreed: ${trade.from} and ${trade.to}`, body), ...league];
    }
    case "declined":
      return mail(`FHL trade declined by ${trade.to}`,
        `${trade.to} has declined the trade proposal from ${trade.from}:\n\n${block}\n\nYou can see your trades on the Trades page:${link("Trades")}`);
    case "withdrawn":
      return mail(`FHL trade withdrawn by ${trade.from}`,
        `${trade.from} has withdrawn their trade proposal to ${trade.to}:\n\n${block}\n\nNothing further is needed.`);
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
    if (!emailConfigured(env) && !env.DISCORD_WEBHOOK_URL) return;
    const job = (async () => {
      try {
        const emails = buildEmails(event, trade, owners, await playerNames(env, trade.season), env.SITE_URL ?? "", env.LEAGUE_EMAIL ?? "");
        const jobs = emails.map((e) => sendEmail(env, e));
        // Accepted trades are also posted to Discord, using the same text as the league email (no lineup advice, no note).
        const league = emails.find((e) => e.label === "league");
        if (league) jobs.push(sendDiscord(env, `**${league.subject}**\n${league.message.replace(/\n- FHL Dashboard$/, "")}`));
        await Promise.all(jobs);
      } catch (e) {
        console.error(`Could not send ${event} emails: ${e.message}`);
      }
    })();
    if (execCtx?.waitUntil) execCtx.waitUntil(job);
    else await job;
  };
}
