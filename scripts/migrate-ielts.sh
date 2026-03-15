#!/bin/bash
# Migration script: Consolidate IELTS series into 2 (Academic + General Training)
# - Creates 2 new series
# - Moves all episodes, renumbers order, renames titles to "C{N} - T{X}R{Y}"
# - Moves local media files to new series directories
# - Does NOT delete old series (user will do that manually after verifying)

set -euo pipefail

DB="$HOME/Library/Application Support/Lession/lession.db"
EPISODES_DIR="$HOME/Library/Application Support/Lession/episodes"

if [ ! -f "$DB" ]; then
  echo "ERROR: Database not found at $DB"
  exit 1
fi

# Check if app is running
if pgrep -f "Lession" > /dev/null 2>&1; then
  echo "WARNING: Lession app appears to be running. Please close it first."
  exit 1
fi

# Backup database
BACKUP="$DB.backup-$(date +%Y%m%d%H%M%S)"
cp "$DB" "$BACKUP"
echo "Database backed up to: $BACKUP"

# Generate UUIDs for new series
ACADEMIC_ID=$(uuidgen | tr '[:upper:]' '[:lower:]')
GT_ID=$(uuidgen | tr '[:upper:]' '[:lower:]')
NOW=$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")

echo "New Academic series ID: $ACADEMIC_ID"
echo "New General Training series ID: $GT_ID"

# Create new series
sqlite3 "$DB" <<SQL
INSERT INTO series (id, title, description, type, language, authors, category, tags, level, createdAt, updatedAt)
VALUES ('$ACADEMIC_ID', 'IELTS Academic', 'IELTS Academic Reading - Cambridge 5-19', 'audiobook', 'en', '["Cambridge"]', 'IELTS', '["ielts","academic"]', NULL, '$NOW', '$NOW');

INSERT INTO series (id, title, description, type, language, authors, category, tags, level, createdAt, updatedAt)
VALUES ('$GT_ID', 'IELTS General Training', 'IELTS General Training Reading - Cambridge 10-15', 'audiobook', 'en', '["Cambridge"]', 'IELTS', '["ielts","general-training"]', NULL, '$NOW', '$NOW');
SQL

echo "Created 2 new series"

# Create new episode directories
mkdir -p "$EPISODES_DIR/$ACADEMIC_ID"
mkdir -p "$EPISODES_DIR/$GT_ID"

# Process Academic series (C5-C19)
ORDER=0
for CN in 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19; do
  SERIES_TITLE="IELTS Academic C${CN}"
  OLD_SERIES_ID=$(sqlite3 "$DB" "SELECT id FROM series WHERE title = '$SERIES_TITLE';")

  if [ -z "$OLD_SERIES_ID" ]; then
    echo "WARNING: Series '$SERIES_TITLE' not found, skipping"
    continue
  fi

  echo "Processing $SERIES_TITLE ($OLD_SERIES_ID)..."

  # Get episodes ordered
  sqlite3 "$DB" "SELECT id, title FROM episodes WHERE seriesId = '$OLD_SERIES_ID' ORDER BY \"order\" ASC;" | while IFS='|' read -r EP_ID EP_TITLE; do
    # Extract T{X}R{Y} from title like "T1R1 - Stepwells"
    TXRY=$(echo "$EP_TITLE" | grep -oE 'T[0-9]+R[0-9]+' || echo "")
    if [ -z "$TXRY" ]; then
      NEW_TITLE="C${CN} - ${EP_TITLE}"
    else
      NEW_TITLE="C${CN} - ${TXRY}"
    fi

    # Update episode: change seriesId, title, order
    sqlite3 "$DB" "UPDATE episodes SET seriesId = '$ACADEMIC_ID', title = '$(echo "$NEW_TITLE" | sed "s/'/''/g")', \"order\" = $ORDER, updatedAt = '$NOW' WHERE id = '$EP_ID';"

    # Move media file
    OLD_DIR="$EPISODES_DIR/$OLD_SERIES_ID"
    if [ -d "$OLD_DIR" ]; then
      for F in "$OLD_DIR/$EP_ID".*; do
        if [ -f "$F" ]; then
          EXT="${F##*.}"
          mv "$F" "$EPISODES_DIR/$ACADEMIC_ID/$EP_ID.$EXT"
          # Update localPath in DB
          sqlite3 "$DB" "UPDATE episodes SET localPath = '$EPISODES_DIR/$ACADEMIC_ID/$EP_ID.$EXT' WHERE id = '$EP_ID';"
          echo "  Moved $EP_ID.$EXT"
        fi
      done
    fi

    ORDER=$((ORDER + 1))
  done

  # Re-read ORDER from the subshell won't propagate, so count from DB
  ORDER=$(sqlite3 "$DB" "SELECT COUNT(*) FROM episodes WHERE seriesId = '$ACADEMIC_ID';")
done

echo "Academic: $ORDER episodes migrated"

# Process General Training series (C10-C15)
ORDER=0
for CN in 10 11 12 13 14 15; do
  SERIES_TITLE="IELTS General Training C${CN}"
  OLD_SERIES_ID=$(sqlite3 "$DB" "SELECT id FROM series WHERE title = '$SERIES_TITLE';")

  if [ -z "$OLD_SERIES_ID" ]; then
    echo "WARNING: Series '$SERIES_TITLE' not found, skipping"
    continue
  fi

  echo "Processing $SERIES_TITLE ($OLD_SERIES_ID)..."

  sqlite3 "$DB" "SELECT id, title FROM episodes WHERE seriesId = '$OLD_SERIES_ID' ORDER BY \"order\" ASC;" | while IFS='|' read -r EP_ID EP_TITLE; do
    TXRY=$(echo "$EP_TITLE" | grep -oE 'T[0-9]+R[0-9]+' || echo "")
    if [ -z "$TXRY" ]; then
      NEW_TITLE="C${CN} - ${EP_TITLE}"
    else
      NEW_TITLE="C${CN} - ${TXRY}"
    fi

    sqlite3 "$DB" "UPDATE episodes SET seriesId = '$GT_ID', title = '$(echo "$NEW_TITLE" | sed "s/'/''/g")', \"order\" = $ORDER, updatedAt = '$NOW' WHERE id = '$EP_ID';"

    OLD_DIR="$EPISODES_DIR/$OLD_SERIES_ID"
    if [ -d "$OLD_DIR" ]; then
      for F in "$OLD_DIR/$EP_ID".*; do
        if [ -f "$F" ]; then
          EXT="${F##*.}"
          mv "$F" "$EPISODES_DIR/$GT_ID/$EP_ID.$EXT"
          sqlite3 "$DB" "UPDATE episodes SET localPath = '$EPISODES_DIR/$GT_ID/$EP_ID.$EXT' WHERE id = '$EP_ID';"
          echo "  Moved $EP_ID.$EXT"
        fi
      done
    fi

    ORDER=$((ORDER + 1))
  done

  ORDER=$(sqlite3 "$DB" "SELECT COUNT(*) FROM episodes WHERE seriesId = '$GT_ID';")
done

echo "General Training: $ORDER episodes migrated"

# Verify
echo ""
echo "=== Verification ==="
sqlite3 "$DB" "SELECT s.title, COUNT(e.id) as episodes FROM series s LEFT JOIN episodes e ON e.seriesId = s.id WHERE s.title LIKE '%IELTS%' GROUP BY s.id ORDER BY s.title;"

echo ""
echo "=== Sample titles (Academic, first 10) ==="
sqlite3 "$DB" "SELECT title FROM episodes WHERE seriesId = '$ACADEMIC_ID' ORDER BY \"order\" LIMIT 10;"

echo ""
echo "=== Sample titles (GT, first 10) ==="
sqlite3 "$DB" "SELECT title FROM episodes WHERE seriesId = '$GT_ID' ORDER BY \"order\" LIMIT 10;"

echo ""
echo "Old series still exist (not deleted). Delete them manually from the app after verifying."
echo "Done!"
