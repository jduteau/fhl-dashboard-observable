#!/bin/bash

# Usage: ./replace_text.sh <directory>
# Replaces all occurrences of 'P-samanjo01' with 'samanjo-01' in a directory

OLD="samanjo-01"
NEW="samanjo01"
DIR="${1:-.}"

if [ ! -d "$DIR" ]; then
  echo "Error: '$DIR' is not a valid directory."
  exit 1
fi

echo "Searching in: $DIR"
echo "Replacing: '$OLD' → '$NEW'"
echo "-----------------------------------"

# Find all files (not directories) and perform in-place replacement
# Uses BSD sed (macOS compatible) with an empty string backup extension
find "$DIR" -type f | while read -r file; do
  if grep -qF "$OLD" "$file" 2>/dev/null; then
    sed -i '' "s/${OLD}/${NEW}/g" "$file"
    echo "Updated: $file"
  fi
done

echo "-----------------------------------"
echo "Done."