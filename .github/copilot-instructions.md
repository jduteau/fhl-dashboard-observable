# FHL Dashboard AI Coding Instructions

## Project Overview
This is an Observable Framework dashboard for Fantasy Hockey League (FHL) management. The app displays team standings, player statistics, roster management, and team comparisons through interactive data visualizations.

## Architecture & Data Flow

### Data Pipeline
- **External data collection**: Shell scripts (`fhlgetstats.sh`, `fhlgetplayerinfo.sh`) fetch stats from external sources
- **Data loaders** (`src/data/*.json.js`): Transform CSV files into structured JSON for the framework
- **CSV data sources** (`src/data/*.csv`): Raw data files for teams, players, contracts, rosters by period
- **Components** (`src/components/loadfiles.js`): Shared utilities for data parsing and calculations

### Key Data Concepts
- **Periods**: FHL operates in numbered periods (P01, P02, etc.) representing scoring periods
- **Stats calculations**: 
  - D-Stat: `blocks + takeaways - giveaways + (toi / divisor)` where divisor = 20 for D, 30 for F
  - G-Stat: `2*wins + ties + 2*shutouts + 0.15*shots_against - goals_against`
  - Toughness: `pim + hits`
- **Position mapping**: Observable uses F/D/G instead of detailed positions like LW/RW/C

### File Patterns
- Period-specific player statistics in src/data using stats_p## naming
- Period-specific team rosters in src/data using rosters_p## naming
- Data loaders export structured objects with `availablePeriods`, `teams`, and calculated rankings

## Development Workflow

### Data Updates
```bash
# Update stats for specific period (e.g., period 5)
./fhlgetstats.sh 05

# Update player information
./fhlgetplayerinfo.sh

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
- Age calculation via `calculateAge()` using birth dates

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
- Uses d3-dsv for CSV parsing, strip-bom for file encoding
- Observable Framework handles build/deployment pipeline