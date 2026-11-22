// Emails the league report written by `apply-moves.mjs materialize` ($REPORT_FILE = {subject, message}) to the league
// address through EmailJS, the same service and template the Worker uses for trade emails.
// Env: REPORT_FILE, LEAGUE_EMAIL, EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, EMAILJS_PUBLIC_KEY, EMAILJS_PRIVATE_KEY.
// Best-effort: a missing setting or a failed send is a warning, never a failed run (the roster is already committed).
import { readFileSync, existsSync } from "fs";

const warn = (msg) => console.log(`::warning::${msg}`);
const env = process.env;
const missing = ["REPORT_FILE", "LEAGUE_EMAIL", "EMAILJS_SERVICE_ID", "EMAILJS_TEMPLATE_ID", "EMAILJS_PUBLIC_KEY", "EMAILJS_PRIVATE_KEY"].filter((k) => !env[k]);
if (missing.length) { warn(`League report not emailed: ${missing.join(", ")} not set`); process.exit(0); }
if (!existsSync(env.REPORT_FILE)) { warn("League report not emailed: no report was written"); process.exit(0); }

const { subject, message } = JSON.parse(readFileSync(env.REPORT_FILE, "utf-8"));
try {
  const res = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      service_id: env.EMAILJS_SERVICE_ID,
      template_id: env.EMAILJS_TEMPLATE_ID,
      user_id: env.EMAILJS_PUBLIC_KEY,
      accessToken: env.EMAILJS_PRIVATE_KEY,
      template_params: { to_email: env.LEAGUE_EMAIL, to_name: "FHL League", subject, message },
    }),
  });
  if (res.ok) console.log(`Emailed "${subject}" to the league`);
  else warn(`EmailJS rejected the league report (HTTP ${res.status}): ${(await res.text()).slice(0, 200)}`);
} catch (e) {
  warn(`League report not emailed: ${e.message}`);
}
