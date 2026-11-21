// Editing player_info.csv as text, for update-player-info.mjs. The file's layout is preserved (header, BOM, line
// endings, no trailing newline): only the rows that change are touched.
import { csvParseRows, csvLine } from "../../src/components/csv.js";

const COLUMNS = ["ID", "Name", "BirthDate", "Pos", "NHL", "HockeyDB", "PuckPedia"];

// Appends new players ({ID, Name, BirthDate, Pos, NHL, HockeyDB, PuckPedia}); a field with a comma or a quote in it is
// quoted, so a name like "Smith, Jr." stays one field.
export function appendPlayers(text, players) {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  return text + players.map((p) => eol + csvLine(COLUMNS.map((c) => p[c] ?? ""))).join("");
}

// Sets the HockeyDB id on the row with this player ID, but only where it is still empty. Every other line is left
// exactly as it was; the player is found by comparing IDs, never by building a pattern from them.
export function setHockeyDbId(text, id, dbId) {
  const parts = text.split(/(\r?\n)/); // lines and their line endings, alternating
  const header = csvParseRows(parts[0].replace(/^﻿/, ""))[0] ?? [];
  const col = header.map((h) => h.trim()).indexOf("HockeyDB");
  if (col < 0) return text;
  return parts
    .map((part, i) => {
      if (i % 2 === 1 || i === 0) return part; // a line ending, or the header
      const fields = csvParseRows(part)[0];
      if (!fields || fields[0].trim() !== id || (fields[col] ?? "") !== "") return part;
      fields[col] = dbId;
      return csvLine(fields);
    })
    .join("");
}
