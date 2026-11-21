// Run with: node --test .github/scripts/test/player-info-lib.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { appendPlayers, setHockeyDbId } from "../player-info-lib.mjs";

const HEADER = "ID,Name,BirthDate,Pos,NHL,HockeyDB,PuckPedia";
const file = (...lines) => lines.join("\n"); // no trailing newline, like the real file

test("appendPlayers: new rows go at the end in column order; the file's layout is kept", () => {
  const text = file(HEADER, "a01,Ann One,2000-01-01,C,ANA,111,ann-one");
  const out = appendPlayers(text, [{ ID: "b01", Name: "Bob Two", BirthDate: "1999-02-02", Pos: "D", NHL: "BOS", HockeyDB: "", PuckPedia: "bob-two" }]);
  assert.equal(out, file(HEADER, "a01,Ann One,2000-01-01,C,ANA,111,ann-one", "b01,Bob Two,1999-02-02,D,BOS,,bob-two"));
  assert.equal(out.endsWith("\n"), false); // still no trailing newline
  assert.equal(appendPlayers(text, []), text);
});

test("appendPlayers: CRLF files get CRLF rows, and a name with a comma or quote stays one field", () => {
  const text = [HEADER, "a01,Ann One,2000-01-01,C,ANA,111,ann-one"].join("\r\n");
  const out = appendPlayers(text, [{ ID: "c01", Name: 'Cal "Tank" Smith, Jr.', BirthDate: "1990-03-03", Pos: "G", NHL: "CHI", HockeyDB: "9", PuckPedia: "cal" }]);
  assert.equal(out, text + '\r\nc01,"Cal ""Tank"" Smith, Jr.",1990-03-03,G,CHI,9,cal');
});

test("setHockeyDbId: fills an empty HockeyDB on the right row and touches nothing else", () => {
  const text = file(HEADER, "a01,Ann One,2000-01-01,C,ANA,,ann-one", "a011,Other,2000-01-01,C,ANA,,other", "b01,Bob Two,1999-02-02,D,BOS,222,bob-two");
  assert.equal(setHockeyDbId(text, "a01", "555"), file(HEADER, "a01,Ann One,2000-01-01,C,ANA,555,ann-one", "a011,Other,2000-01-01,C,ANA,,other", "b01,Bob Two,1999-02-02,D,BOS,222,bob-two"));
});

test("setHockeyDbId: an existing id is never overwritten, an unknown player changes nothing", () => {
  const text = file(HEADER, "b01,Bob Two,1999-02-02,D,BOS,222,bob-two");
  assert.equal(setHockeyDbId(text, "b01", "999"), text);
  assert.equal(setHockeyDbId(text, "zzz", "999"), text);
});

test("setHockeyDbId: ids with regex characters are matched literally; BOM, CRLF and quoted names survive", () => {
  const text = ["﻿" + HEADER, 'a.b+01,"Smith, Jr.",2000-01-01,C,ANA,,x', "axb01,Decoy,2000-01-01,C,ANA,,y"].join("\r\n");
  const out = setHockeyDbId(text, "a.b+01", "42");
  assert.equal(out, ["﻿" + HEADER, 'a.b+01,"Smith, Jr.",2000-01-01,C,ANA,42,x', "axb01,Decoy,2000-01-01,C,ANA,,y"].join("\r\n"));
});

test("setHockeyDbId: a file with no HockeyDB column is left alone", () => {
  const text = file("ID,Name", "a01,Ann");
  assert.equal(setHockeyDbId(text, "a01", "1"), text);
});
