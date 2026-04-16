# FHL Dashboard AI Coding Instructions

## Project Overview
This is a comprehensive Observable Framework dashboard for Fantasy Hockey League (FHL) management (2025-26 season). The app displays team standings, player statistics, roster management, and team comparisons through interactive data visualizations. Features seven main sections: Team Standings, Team Information, Team Statistics (Players), Team Roster, Overall Stats, Compare Teams, and Stats Visualizations.

## Architecture & Data Flow

### Data Pipeline
- **External data collection**: Shell scripts (`fhlgetstats.sh`, `fhlgetplayerinfo.sh`, `fhlgetplayoffstats.sh`) fetch stats from external sources
- **Data loaders** (`src/data/*.json.js`): Transform CSV files into structured JSON for the framework  
- **CSV data sources** (`src/data/static/*.csv`): Raw data files for teams, players, contracts
- **Period-specific data**: `src/data/static/stats/` and `src/data/static/rosters/` contain period-numbered files (P01-P25)
- **Components** (`src/components/loadfiles.js`): Shared utilities for data parsing, stat calculations, and period management

### Key Data Concepts
- **Periods**: FHL operates in numbered periods (P01, P02, etc.) representing scoring periods. Currently supports 25 periods.
- **Stats calculations**: 
  - D-Stat: `blocks + takeaways - giveaways + (toi / divisor)` where divisor = 20 for D, 30 for F
  - G-Stat: `2*wins + ties + 2*shutouts + 0.15*shots_against - goals_against`
  - Toughness: `pim + hits`
- **Position mapping**: Observable uses F/D/G instead of detailed positions like LW/RW/C via `mapPosition()`
- **Age calculations**: Ages calculated as of September 15, 2025 cutoff date via `calculateAge()`
- **Period differentials**: `getStatsForPeriod()` calculates period-to-period stat changes

### File Patterns
- Period-specific player statistics: `src/data/static/stats/stats_p##.csv` (P01-P25)
- Period-specific team rosters: `src/data/static/rosters/rosters_p##.csv` (P01-P25)
- Data loaders export structured objects with `availablePeriods`, `teams`, and calculated rankings
- Core utilities in `loadfiles.js`: `statsPeriods`, `rosterPeriods`, `statsData`, `rosterData` arrays
- Available periods dynamically determined: `availablePeriods = [...Object.keys(statsData)]`

## Development Workflow

### Data Updates
```bash
# Update stats for specific period (e.g., period 5)
./fhlgetstats.sh 05

# Update player information  
./fhlgetplayerinfo.sh

# Update playoff statistics
./fhlgetplayoffstats.sh

# Clear data cache and rebuild
npm run clean && npm run dev
```

### Local Development
```bash
npm run dev      # Start preview server on localhost:3000
npm run build    # Generate static site in ./dist
npm run deploy   # Deploy to Observable Cloud
```

## Code Conventions

### Data Processing
- Use `readCsvFile()` and `readStatsFile()` from `loadfiles.js` for consistent CSV parsing
- Numeric fields are auto-converted: `CASH`, `Salary`, and all `stats/*` fields
- Position mapping through `mapPosition()`: converts NHL positions to F/D/G
- Age calculation via `calculateAge()` using birth dates with September 15, 2025 cutoff
- Period-specific stats via `getStatsForPeriod()`: calculates period differentials for all fantasy stats
- Data structures: `statsData[period]` and `rosterData[period]` for period-specific access
- Latest data shortcuts: `latestStatsFile` and `latestRosterFile` for current period defaults

### UI Patterns
- **Period selectors**: Use `availablePeriods` array with last period as default
- **Tab interfaces**: Custom CSS classes `.tabs`, `.tab-buttons`, `.tab-content` with `showTab()` JS function
- **Table formatting**: Use `Inputs.table()` with specific `format` objects for numeric display
- **Division grouping**: Teams are grouped by `DIVISION` field for standings displays

### Page Structure
- All pages use `theme: dashboard` and `toc: false` in frontmatter
- Data loading via `FileAttachment("./data/filename.json").json()`
- Interactive inputs through `Inputs.select()` and `Generators.input()`

## Key Files to Reference
- `src/components/loadfiles.js`: Core data utilities and stat calculations
- `src/data/standings.json.js`: Complex ranking algorithms and team aggregations  
- `src/Standings.md`: Tab interface and division-based table patterns
- `observablehq.config.js`: Page routing and navigation structure

## External Dependencies
- Data updates require external Node.js scripts in separate `FHL-Stat-Scripts` directory
- Uses d3-dsv for CSV parsing, strip-bom for file encoding, d3-time-format for date handling
- Observable Framework handles build/deployment pipeline
- Node.js engine requirement: >=18
- Development dependency: rimraf for cache clearing

## Current Season Details
- **Season**: 2025-26
- **App Title**: "2025-26 FHL Dashboard"
- **Age Cutoff**: September 15, 2025
- **Supported Periods**: 1-25 (P01-P25)
- **Navigation**: 7 main sections with custom page routing in observablehq.config.js