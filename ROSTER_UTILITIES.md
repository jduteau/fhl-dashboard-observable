# FHL Roster Analysis Utilities

This directory contains utilities for analyzing FHL roster files to count active players by position. Supports both regular season periods and playoff rounds.

## Files

- **`countActiveRoster.js`** - Node.js utility for analyzing roster files
- **`count_roster.sh`** - Shell script wrapper for easy usage  

## Usage

### Option 1: Use the shell script wrapper (recommended)

```bash
# Count active players in period 25
./count_roster.sh 25

# Count active players in period 1  
./count_roster.sh 1

# Count playoff round 1 (multiple formats supported)
./count_roster.sh r1
./count_roster.sh playoff1

# Count from a specific file
./count_roster.sh src/data/static/rosters/rosters_p25.csv
./count_roster.sh src/data/static/rosters/rosters_playoff_r01.csv

# Show help and available periods/playoff rounds
./count_roster.sh
```

### Option 2: Use the Node.js script directly

```bash
# Direct usage with specific file
node countActiveRoster.js src/data/static/rosters/rosters_p25.csv
node countActiveRoster.js src/data/static/rosters/rosters_playoff_r01.csv

# Show usage help
node countActiveRoster.js
```

## Output

The utilities automatically detect roster type and provide:

- **Total player counts** (active vs reserve)
- **Overall position breakdown** (Forwards, Defensemen, Goalies)  
- **Team-by-team breakdown** showing each team's active roster composition
- **Roster type identification** (Regular Season vs Playoff)
- **Roster legality validation** with detailed violation reporting

### Roster Validation Rules

#### All Rosters (Regular Season & Playoff):
- **Maximum 20 players** per team
- **Maximum 2 goalies** per team  
- **Maximum 7 defensemen** per team

#### Regular Season Rosters Only:
- **Minimum 20 players** per team (exactly 20 required)
- **Minimum 6 defensemen** per team
- **Minimum 2 goalies** per team

### Sample Output

#### Regular Season Roster (All Legal)
```
=== REGULAR SEASON ROSTER ANALYSIS: src/data/static/rosters/rosters_p25.csv ===
Total Players: 1062
Active Players: 640
Reserve Players: 422

OVERALL ACTIVE PLAYER COUNTS:
  Forwards: 373
  Defensemen: 203
  Goalies: 64

BY TEAM:
  ANA: 20 total (F:12, D:6, G:2)
  BOS: 20 total (F:11, D:7, G:2)
  ...

✅ ALL ROSTERS LEGAL: No violations detected
```

#### Playoff Roster (With Violations)
```
=== PLAYOFF ROSTER ANALYSIS: src/data/static/rosters/rosters_playoff_r01.csv ===
Total Players: 1062
Active Players: 545
Reserve Players: 517

OVERALL ACTIVE PLAYER COUNTS:
  Forwards: 325
  Defensemen: 161
  Goalies: 59

BY TEAM:
  ANA: 8 total (F:8, D:0, G:0)
  BOS: 12 total (F:4, D:5, G:3) ❌ ILLEGAL: Too many goalies (3/2 max)
  CGY: 25 total (F:18, D:6, G:1) ❌ ILLEGAL: Too many players (25/20 max)
  WPG: 29 total (F:14, D:10, G:5) ❌ ILLEGAL: Too many players (29/20 max), Too many goalies (5/2 max), Too many defensemen (10/7 max)
  ...

⚠️  ROSTER VIOLATIONS DETECTED: 16 team(s) have illegal rosters
```

## How It Works

1. **Reads the roster file** (CSV format with ID, ABBR, RESERVE columns; playoff rosters may have additional NHL column)
2. **Detects roster type** (regular season vs playoff based on filename and format)
3. **Identifies active players** (those without "R" in the RESERVE column)
4. **Looks up player positions** from `src/data/static/player_info.csv`
5. **Maps positions** using the existing `mapPosition()` function (F/D/G)
6. **Counts and reports** by position overall and by team

## Supported Formats

### Shell Script Input Formats
- **Period numbers**: `1`, `25`, `01`, `05` → `rosters_p01.csv`, `rosters_p25.csv`
- **Playoff rounds**: `r1`, `r2`, `r01` → `rosters_playoff_r01.csv`, `rosters_playoff_r02.csv`  
- **Alternative playoff**: `playoff1`, `playoff2` → `rosters_playoff_r01.csv`, `rosters_playoff_r02.csv`
- **Direct file paths**: `src/data/static/rosters/rosters_p25.csv`

### Available Files
- **Regular season periods**: P01-P25 (`rosters_p01.csv` through `rosters_p25.csv`)
- **Playoff rounds**: R01-R04 (`rosters_playoff_r01.csv` through `rosters_playoff_r04.csv`)

## Dependencies

- Node.js (v18+)
- The following npm packages (already in package.json):
  - `d3-dsv` for CSV parsing
  - `strip-bom` for file encoding

## Data Sources

- **Regular season roster files**: `src/data/static/rosters/rosters_pXX.csv`
- **Playoff roster files**: `src/data/static/rosters/rosters_playoff_rXX.csv`
- **Player info**: `src/data/static/player_info.csv` (for position lookups)