# FHL Dashboard

A comprehensive Fantasy Hockey League (FHL) management dashboard built with [Observable Framework](https://observablehq.com/framework/). This application provides interactive visualizations for team standings, player statistics, roster management, and team comparisons.

## Quick Start

Install dependencies and start the development server:

```bash
npm install
npm run dev
```

Then visit <http://localhost:3000> to preview your app.

## Project Overview

The FHL Dashboard consists of seven main sections:

- **Team Standings** - Division-based standings and overall team rankings
- **Team Information** - Team details, cash, salaries, and roster summaries  
- **Team Statistics** (Players) - Individual player performance and fantasy statistics
- **Team Roster** - Period-specific roster management and player assignments
- **Overall Stats** - Cumulative statistics across all periods
- **Compare Teams** - Head-to-head team performance comparison
- **Stats Visualizations** - Interactive charts and graphs

## Project Structure

```
.
├─ src/
│  ├─ components/
│  │  └─ loadfiles.js           # shared data utilities and stat calculations
│  ├─ data/
│  │  ├─ *.json.js              # data loaders (transform CSV to JSON)
│  │  └─ static/
│  │     ├─ *.csv               # raw team/player data
│  │     ├─ stats/              # period-specific stats (stats_p01.csv - stats_p25.csv)
│  │     └─ rosters/            # period-specific rosters (rosters_p01.csv - rosters_p25.csv)
│  ├─ *.md                      # dashboard pages
│  └─ index.md                  # home page
├─ fhlgetstats.sh              # fetch stats for specific period
├─ fhlgetplayerinfo.sh         # update player information
├─ fhlgetplayoffstats.sh       # fetch playoff statistics
└─ observablehq.config.js      # app configuration and navigation
```

**`src`** - Source root containing all dashboard pages (Markdown files), data loaders, and shared components.

**`src/components/loadfiles.js`** - Core utilities for data parsing, stat calculations (D-Stat, G-Stat, Toughness), position mapping, age calculations, and period management.

**`src/data/`** - Data loaders that transform CSV files into structured JSON, plus static CSV files organized by periods.

**`observablehq.config.js`** - App configuration defining the seven main navigation sections and page routing.

## FHL Data Concepts

### Periods
FHL operates in numbered periods (P01, P02, etc.) representing scoring periods throughout the season. Currently supports periods 1-25.

### Fantasy Statistics
- **D-Stat**: `blocks + takeaways - giveaways + (toi / divisor)` where divisor = 20 for defensemen, 30 for forwards
- **G-Stat**: `2*wins + ties + 2*shutouts + 0.15*shots_against - goals_against`
- **Toughness**: `pim + hits`

### Position Mapping
- NHL positions (C, LW, RW, etc.) are mapped to simplified positions: F (Forward), D (Defense), G (Goalie)
- Age calculations use September 15 cutoff date for the current season

## Data Management

### Updating Stats
```bash
# Update stats for specific period (e.g., period 5)
./fhlgetstats.sh 05

# Update player information
./fhlgetplayerinfo.sh

# Update playoff stats
./fhlgetplayoffstats.sh

# Clear data cache and rebuild
npm run clean && npm run dev
```

### Data Dependencies
- Requires external Node.js scripts in separate `FHL-Stat-Scripts` directory
- Stats are fetched from external sources and processed into CSV format
- Data loaders transform CSV files into structured JSON for the framework

## Command Reference

| Command              | Description                                              |
| -------------------- | -------------------------------------------------------- |
| `npm install`        | Install or reinstall dependencies                        |
| `npm run dev`        | Start local preview server                               |
| `npm run build`      | Build your static site, generating `./dist`             |
| `npm run deploy`     | Deploy your app to Observable Cloud                     |
| `npm run clean`      | Clear the local data loader cache                       |
| `npm run observable` | Run commands like `observable help`                     |
| `./fhlgetstats.sh ##`| Update stats for specific period number                 |
| `./fhlgetplayerinfo.sh` | Update player information                             |
| `./fhlgetplayoffstats.sh` | Update playoff statistics                           |

## Technical Stack

- **Framework**: Observable Framework
- **Data Processing**: d3-dsv for CSV parsing, strip-bom for file encoding
- **Visualization**: Built-in Observable Framework components and D3.js
- **Deployment**: Observable Cloud

For more information about Observable Framework, see <https://observablehq.com/framework/getting-started>.# FHL Dashboard

A comprehensive Fantasy Hockey League (FHL) management dashboard built with [Observable Framework](https://observablehq.com/framework/). This application provides interactive visualizations for team standings, player statistics, roster management, and team comparisons.

## Quick Start

Install dependencies and start the development server:

```bash
npm install
npm run dev
```

Then visit <http://localhost:3000> to preview your app.

## Project structure

A typical Framework project looks like this:

```ini
.
├─ src
│  ├─ components
│  │  └─ timeline.js           # an importable module
│  ├─ data
│  │  ├─ launches.csv.js       # a data loader
│  │  └─ events.json           # a static data file
│  ├─ example-dashboard.md     # a page
│  ├─ example-report.md        # another page
│  └─ index.md                 # the home page
├─ .gitignore
├─ observablehq.config.js      # the app config file
├─ package.json
└─ README.md
```

**`src`** - This is the “source root” — where your source files live. Pages go here. Each page is a Markdown file. Observable Framework uses [file-based routing](https://observablehq.com/framework/project-structure#routing), which means that the name of the file controls where the page is served. You can create as many pages as you like. Use folders to organize your pages.

**`src/index.md`** - This is the home page for your app. You can have as many additional pages as you’d like, but you should always have a home page, too.

**`src/data`** - You can put [data loaders](https://observablehq.com/framework/data-loaders) or static data files anywhere in your source root, but we recommend putting them here.

**`src/components`** - You can put shared [JavaScript modules](https://observablehq.com/framework/imports) anywhere in your source root, but we recommend putting them here. This helps you pull code out of Markdown files and into JavaScript modules, making it easier to reuse code across pages, write tests and run linters, and even share code with vanilla web applications.

**`observablehq.config.js`** - This is the [app configuration](https://observablehq.com/framework/config) file, such as the pages and sections in the sidebar navigation, and the app’s title.

## FHL Data Concepts

### Periods
FHL operates in numbered periods (P01, P02, etc.) representing scoring periods throughout the season. Currently supports periods 1-25.

### Fantasy Statistics
- **D-Stat**: `blocks + takeaways - giveaways + (toi / divisor)` where divisor = 20 for defensemen, 30 for forwards
- **G-Stat**: `2*wins + ties + 2*shutouts + 0.15*shots_against - goals_against`
- **Toughness**: `pim + hits`

### Position Mapping
- NHL positions (C, LW, RW, etc.) are mapped to simplified positions: F (Forward), D (Defense), G (Goalie)
- Age calculations use September 15 cutoff date for the current season

## Data Management

### Updating Stats
```bash
# Update stats for specific period (e.g., period 5)
./fhlgetstats.sh 05

# Update player information
./fhlgetplayerinfo.sh

# Update playoff stats
./fhlgetplayoffstats.sh

# Clear data cache and rebuild
npm run clean && npm run dev
```

### Data Dependencies
- Requires external Node.js scripts in separate `FHL-Stat-Scripts` directory
- Stats are fetched from external sources and processed into CSV format
- Data loaders transform CSV files into structured JSON for the framework

## Command Reference

| Command              | Description                                              |
| -------------------- | -------------------------------------------------------- |
| `npm install`        | Install or reinstall dependencies                        |
| `npm run dev`        | Start local preview server                               |
| `npm run build`      | Build your static site, generating `./dist`             |
| `npm run deploy`     | Deploy your app to Observable Cloud                     |
| `npm run clean`      | Clear the local data loader cache                       |
| `npm run observable` | Run commands like `observable help`                     |
| `./fhlgetstats.sh ##`| Update stats for specific period number                 |
| `./fhlgetplayerinfo.sh` | Update player information                             |
| `./fhlgetplayoffstats.sh` | Update playoff statistics                           |

## Technical Stack

- **Framework**: Observable Framework
- **Data Processing**: d3-dsv for CSV parsing, strip-bom for file encoding
- **Visualization**: Built-in Observable Framework components and D3.js
- **Deployment**: Observable Cloud

For more information about Observable Framework, see <https://observablehq.com/framework/getting-started>.
