#!/bin/bash

# FHL Roster Counter - Easy wrapper for countActiveRoster.js
# Usage: ./count_roster.sh [period_number|roster_file]

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROSTER_DIR="$SCRIPT_DIR/src/data/static/rosters"

if [ $# -eq 0 ]; then
    echo "FHL Active Roster Counter"
    echo "========================"
    echo ""
    echo "Usage: $0 [period_number|playoff_round|roster_file]"
    echo ""
    echo "Examples:"
    echo "  $0 25                                    # Count active players in period 25"
    echo "  $0 01                                    # Count active players in period 1"  
    echo "  $0 r1                                    # Count active players in playoff round 1"
    echo "  $0 playoff2                              # Count active players in playoff round 2"
    echo "  $0 src/data/static/rosters/rosters_p25.csv # Count from specific file"
    echo ""
    echo "Available periods:"
    ls "$ROSTER_DIR"/rosters_p[0-9][0-9].csv 2>/dev/null | sed 's/.*rosters_p\([0-9][0-9]\)\.csv/  \1/' | sort -n
    echo ""
    echo "Available playoff rounds:"
    ls "$ROSTER_DIR"/rosters_playoff_r*.csv 2>/dev/null | sed 's/.*rosters_playoff_r\([0-9][0-9]\)\.csv/  r\1/' | sort
    exit 1
fi

INPUT="$1"

# Check if input is a number (period), playoff round, or file path
if [[ "$INPUT" =~ ^[0-9]+$ ]]; then
    # Regular period number
    PERIOD=$(printf "%02d" "$INPUT")
    ROSTER_FILE="$ROSTER_DIR/rosters_p${PERIOD}.csv"
    
    if [ ! -f "$ROSTER_FILE" ]; then
        echo "Error: Roster file for period $PERIOD not found: $ROSTER_FILE"
        echo "Available periods:"
        ls "$ROSTER_DIR"/rosters_p[0-9][0-9].csv 2>/dev/null | sed 's/.*rosters_p\([0-9][0-9]\)\.csv/  \1/' | sort -n
        exit 1
    fi
elif [[ "$INPUT" =~ ^r[0-9]+$ ]]; then
    # Playoff round format: r1, r2, etc.
    ROUND=$(echo "$INPUT" | sed 's/r//')
    ROUND_PADDED=$(printf "%02d" "$ROUND")
    ROSTER_FILE="$ROSTER_DIR/rosters_playoff_r${ROUND_PADDED}.csv"
    
    if [ ! -f "$ROSTER_FILE" ]; then
        echo "Error: Playoff roster file for round $ROUND not found: $ROSTER_FILE"
        echo "Available playoff rounds:"
        ls "$ROSTER_DIR"/rosters_playoff_r*.csv 2>/dev/null | sed 's/.*rosters_playoff_r\([0-9][0-9]\)\.csv/  r\1/' | sort
        exit 1
    fi
elif [[ "$INPUT" =~ ^playoff[0-9]+$ ]]; then
    # Playoff round format: playoff1, playoff2, etc.
    ROUND=$(echo "$INPUT" | sed 's/playoff//')
    ROUND_PADDED=$(printf "%02d" "$ROUND")
    ROSTER_FILE="$ROSTER_DIR/rosters_playoff_r${ROUND_PADDED}.csv"
    
    if [ ! -f "$ROSTER_FILE" ]; then
        echo "Error: Playoff roster file for round $ROUND not found: $ROSTER_FILE"
        echo "Available playoff rounds:"
        ls "$ROSTER_DIR"/rosters_playoff_r*.csv 2>/dev/null | sed 's/.*rosters_playoff_r\([0-9][0-9]\)\.csv/  r\1/' | sort
        exit 1
    fi
else
    # Assume it's a file path
    ROSTER_FILE="$INPUT"
    
    if [ ! -f "$ROSTER_FILE" ]; then
        echo "Error: Roster file not found: $ROSTER_FILE"
        exit 1
    fi
fi

# Run the Node.js utility
node "$SCRIPT_DIR/countActiveRoster.js" "$ROSTER_FILE"