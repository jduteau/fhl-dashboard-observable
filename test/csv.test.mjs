// Run with: node --test test/csv.test.mjs
// The dependency-free CSV reader/writer shared by the Worker and the GitHub scripts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { csvParseRows, csvParse, csvField, csvLine } from "../src/components/csv.js";
import { csvParse as d3Parse } from "d3-dsv";

test("rows: plain, quoted, doubled quotes, commas and line breaks inside quotes", () => {
  assert.deepEqual(csvParseRows("a,b,c\n1,2,3\n"), [["a", "b", "c"], ["1", "2", "3"]]);
  assert.deepEqual(csvParseRows('x,"Hamilton, Ontario",z'), [["x", "Hamilton, Ontario", "z"]]);
  assert.deepEqual(csvParseRows('x,"say ""hi""",z'), [["x", 'say "hi"', "z"]]);
  assert.deepEqual(csvParseRows('x,"two\nlines",z'), [["x", "two\nlines", "z"]]);
});

test("rows: CRLF and LF endings, no final newline, blank lines skipped, empty fields kept", () => {
  assert.deepEqual(csvParseRows("a,b\r\n1,2\r\n\r\n3,4"), [["a", "b"], ["1", "2"], ["3", "4"]]);
  assert.deepEqual(csvParseRows("a,,c\n,,\n1,,"), [["a", "", "c"], ["1", "", ""]]); // an all-empty line is blank
  assert.deepEqual(csvParseRows(""), []);
});

test("objects: keyed by the header, trimmed, a short row padded, BOM ignored, empty text gives []", () => {
  assert.deepEqual(csvParse("﻿ID , Name\n a1 , Ann \nb2"), [{ ID: "a1", Name: "Ann" }, { ID: "b2", Name: "" }]);
  assert.deepEqual(csvParse(""), []);
  assert.deepEqual(csvParse("ID,Name\n"), []);
});

test("it reads the league's real CSV files exactly like d3-dsv does", () => {
  for (const f of ["src/data/static/2026-27/owners.csv", "src/data/static/2026-27/player_info.csv", "src/data/static/seasons.csv", "src/data/static/2026-27/rosters/rosters_p07.csv"]) {
    const text = readFileSync(f, "utf-8").replace(/^﻿/, "");
    const trim = (rows) => rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k.trim(), String(v).trim()])));
    assert.deepEqual(csvParse(text), trim(d3Parse(text)), f);
  }
});

test("writing: a field is quoted only when it has to be, and a written line reads back the same", () => {
  assert.equal(csvField("plain"), "plain");
  assert.equal(csvField("Smith, Jr."), '"Smith, Jr."');
  assert.equal(csvField('say "hi"'), '"say ""hi"""');
  assert.equal(csvField("two\nlines"), '"two\nlines"');
  assert.equal(csvField(null), "");
  assert.equal(csvField(undefined), "");
  assert.equal(csvField(42), "42");
  const fields = ["a1", "Smith, Jr.", 'say "hi"', "", "end"];
  assert.equal(csvLine(fields), 'a1,"Smith, Jr.","say ""hi""",,end');
  assert.deepEqual(csvParseRows(csvLine(fields))[0], fields);
});
