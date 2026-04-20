#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const roundNum = process.argv[2];
if (!roundNum) {
  console.error('Usage: node convert_playoff_stats.js <round_number>');
  console.error('  Example: node convert_playoff_stats.js 01');
  process.exit(1);
}

const skaterFile = path.join(__dirname, 'fhl_playoff_stats_overall.csv');
const goalieFile = path.join(__dirname, 'fhl_playoff_goalies_stats_overall.csv');
const outputFile = path.join(__dirname, 'src/data/static/stats', `stats_playoff_r${roundNum}.csv`);

function parseTOI(toi) {
  if (!toi) return '';
  const [min, sec] = toi.split(':').map(Number);
  return Math.floor(min + sec / 60).toString();
}

function parseCSV(text) {
  const lines = text.replace(/^\uFEFF/, '').trim().split('\n');
  const headers = lines[0].split(',');
  return lines.slice(1).map(line => {
    const values = line.split(',');
    return Object.fromEntries(headers.map((h, i) => [h.trim(), (values[i] || '').trim()]));
  });
}

const skaterRows = parseCSV(fs.readFileSync(skaterFile, 'utf8'));
const goalieRows = parseCSV(fs.readFileSync(goalieFile, 'utf8'));

const outputHeaders = [
  'hockeyRef', 'team', 'pos',
  'stats/gp', 'stats/goals', 'stats/assists', 'stats/pim', 'stats/plusMinus',
  'stats/ppg', 'stats/shg', 'stats/gwg', 'stats/how', 'stats/fol',
  'stats/shots', 'stats/blocks', 'stats/hits', 'stats/toi',
  'stats/take', 'stats/give',
  'stats/wins', 'stats/losses', 'stats/ties', 'stats/ga', 'stats/sa', 'stats/so',
];

const skaterOutputRows = skaterRows.map(r => [
  r['ID'], r['Team'], r['Pos'],
  r['GP'], r['G'], r['A'], r['PIM'], r['+/-'],
  r['PPG'], r['SHG'], r['GWG'], r['FOW'], r['FOL'],
  r['SOG'], r['BLK'], r['HIT'], parseTOI(r['TOI']),
  r['TAKE'], r['GIVE'],
  '', '', '', '', '', '',
]);

const goalieOutputRows = goalieRows.map(r => [
  r['ID'], r['Team'], r['Pos'],
  r['GP'], r['G'], r['A'], r['PIM'], '',
  '', '', '', '', '',
  '', '', '', parseTOI(r['MIN']),
  '', '',
  r['W'], r['L'], r['T/O'], r['GA'], r['Shots'], r['SO'],
]);

const outputRows = [...skaterOutputRows, ...goalieOutputRows];

const outputLines = [
  outputHeaders.join(','),
  ...outputRows.map(row => row.join(',')),
];

fs.writeFileSync(outputFile, outputLines.join('\n') + '\n');
console.log(`Written ${skaterOutputRows.length} skaters + ${goalieOutputRows.length} goalies = ${outputRows.length} total rows to ${outputFile}`);
