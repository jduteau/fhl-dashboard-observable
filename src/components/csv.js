// Minimal CSV reading and writing with no dependencies. d3-dsv can't be used in a Cloudflare Worker (it relies on
// `new Function`), and the GitHub Action scripts run without `npm install`, so both share this instead.

// Parses CSV text into rows of fields (arrays of strings). Handles quoted fields (including doubled quotes and commas
// or line breaks inside them), LF and CRLF line endings, and a missing final newline. Blank lines are skipped.
export function csvParseRows(text) {
  const rows = [];
  let row = [], field = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') q = false;
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((v) => v !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows;
}

// Parses CSV text into objects keyed by the header row. Header names and values are trimmed; a short row gets "" for
// the fields it lacks. A leading byte-order mark is ignored. Empty text gives [].
export function csvParse(text) {
  const [head, ...body] = csvParseRows(String(text).replace(/^﻿/, ""));
  if (!head) return [];
  const cols = head.map((h) => h.trim());
  return body.map((r) => Object.fromEntries(cols.map((h, i) => [h, (r[i] ?? "").trim()])));
}

// One field as CSV text: quoted (with quotes doubled) only when it has to be
export const csvField = (value) => {
  const s = String(value ?? "");
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// One CSV line (no line ending) from a list of fields
export const csvLine = (fields) => fields.map(csvField).join(",");
