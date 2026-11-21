// Run with: node --test test/ranking.test.mjs
// The league's ranking rules, in isolation (standings.test.mjs and playoffHelpers.test.mjs cover them through the pages' data).
import { test } from "node:test";
import assert from "node:assert/strict";
import { RANKED_STATS, roundForRanking, rankStat, rankOverall } from "../src/components/ranking.js";

const entries = (...values) => values.map(([key, value, played = true]) => ({ key, value, played }));

test("the five ranked stats, in tie-break order", () => {
  assert.deepEqual(RANKED_STATS, ["goals", "assists", "toughness", "dstat", "gstat"]);
});

test("rounding before ranking: DStat to 4 places, GStat to 2, the integer stats untouched", () => {
  assert.equal(roundForRanking("dstat", 3.123456), 3.1235);
  assert.equal(roundForRanking("gstat", 7.456), 7.46);
  assert.equal(roundForRanking("goals", 12), 12);
  assert.equal(roundForRanking("toughness", 5), 5);
});

test("best value gets the top rank, worst gets 1; ties share the first rank and the next one skips", () => {
  assert.deepEqual(rankStat(entries(["a", 10], ["b", 7], ["c", 3]), "goals", 3), { a: 3, b: 2, c: 1 });
  assert.deepEqual(rankStat(entries(["a", 5], ["b", 5], ["c", 3], ["d", 1]), "goals", 4), { a: 4, b: 4, c: 2, d: 1 });
  assert.deepEqual(rankStat(entries(["a", 0], ["b", 0], ["c", 0]), "assists", 3), { a: 3, b: 3, c: 3 }); // a level field
  assert.deepEqual(rankStat(entries(["a", 2]), "goals", 1), { a: 1 });
  assert.deepEqual(rankStat([], "goals", 0), {});
});

test("DStat values within 0.0001 count as equal, GStat within 0.01", () => {
  assert.deepEqual(rankStat(entries(["a", 5.00005], ["b", 5], ["c", 4]), "dstat", 3), { a: 3, b: 3, c: 1 });
  assert.deepEqual(rankStat(entries(["a", 5.001], ["b", 5], ["c", 4]), "dstat", 3), { a: 3, b: 2, c: 1 }); // 0.001 apart is different
  assert.deepEqual(rankStat(entries(["a", 8.004], ["b", 8], ["c", 1]), "gstat", 3), { a: 3, b: 3, c: 1 });
  assert.deepEqual(rankStat(entries(["a", 8.02], ["b", 8], ["c", 1]), "gstat", 3), { a: 3, b: 2, c: 1 }); // 0.02 apart is different
});

test("GStat: teams whose goalies did not play rank below every team whose goalies did", () => {
  const ranks = rankStat(entries(["bad", -50, true], ["idle1", 0, false], ["good", 9, true], ["idle2", 0, false]), "gstat", 4);
  assert.deepEqual(ranks, { good: 4, bad: 3, idle1: 2, idle2: 2 }); // idle teams share the next ranks down, whatever their 0
  assert.deepEqual(rankStat(entries(["a", 0, false], ["b", 0, false]), "gstat", 2), { a: 2, b: 2 }); // nobody played
  assert.deepEqual(rankStat(entries(["a", 3, false], ["b", 9, false]), "goals", 2), { b: 2, a: 1 }); // `played` only matters for GStat
});

const team = (key, ranks, values = {}) => ({ key, ranks: { goals: 0, assists: 0, toughness: 0, dstat: 0, gstat: 0, ...ranks }, values });

test("overall rank: the highest rank total is first (1 = best)", () => {
  const overall = rankOverall([
    team("low", { goals: 1, assists: 1, toughness: 1, dstat: 1, gstat: 1 }),
    team("high", { goals: 3, assists: 3, toughness: 3, dstat: 3, gstat: 3 }),
    team("mid", { goals: 2, assists: 2, toughness: 2, dstat: 2, gstat: 2 }),
  ]);
  assert.deepEqual(overall, { high: 1, mid: 2, low: 3 });
});

test("level rank totals are split by goals, then assists, toughness, DStat, GStat", () => {
  const same = { goals: 2, assists: 2, toughness: 2, dstat: 2, gstat: 2 };
  const order = (values) => {
    const r = rankOverall(Object.entries(values).map(([key, v]) => team(key, same, v)));
    return Object.keys(r).sort((a, b) => r[a] - r[b]);
  };
  const base = { goals: 5, assists: 5, toughness: 5, dstat: 5, gstat: 5 };
  assert.deepEqual(order({ x: { ...base, goals: 6 }, y: { ...base, assists: 99 } }), ["x", "y"]); // goals first
  assert.deepEqual(order({ x: { ...base, assists: 6 }, y: { ...base, toughness: 99 } }), ["x", "y"]); // then assists
  assert.deepEqual(order({ x: { ...base, toughness: 6 }, y: { ...base, dstat: 99 } }), ["x", "y"]);
  assert.deepEqual(order({ x: { ...base, dstat: 6 }, y: { ...base, gstat: 99 } }), ["x", "y"]);
  assert.deepEqual(order({ x: { ...base, gstat: 6 }, y: { ...base } }), ["x", "y"]);
});

test("teams level on every tie-break share an overall rank, and the next team skips the places taken", () => {
  const same = { goals: 2, assists: 2, toughness: 2, dstat: 2, gstat: 2 };
  const v = { goals: 5, assists: 5, toughness: 5, dstat: 5, gstat: 5 };
  const overall = rankOverall([
    team("a", { goals: 3, assists: 3, toughness: 3, dstat: 3, gstat: 3 }, v),
    team("b", same, v), team("c", same, v),
    team("d", { goals: 1, assists: 1, toughness: 1, dstat: 1, gstat: 1 }, v),
  ]);
  assert.deepEqual(overall, { a: 1, b: 2, c: 2, d: 4 });
});

test("missing ranks and values count as zero", () => {
  const overall = rankOverall([{ key: "a", ranks: { goals: 4 } }, { key: "b", ranks: {}, values: undefined }]);
  assert.deepEqual(overall, { a: 1, b: 2 });
});
