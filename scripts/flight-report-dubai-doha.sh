#!/bin/zsh
# Daily flight report: Dubai/Doha → Thailand (with war situation context)

REPORT_FILE="$HOME/.openclaw/workspace/memory/$(date '+%Y-%m-%d').md"
DATE=$(date '+%Y-%m-%d %H:%M')

# Create/append to memory file
{
  echo "## ✈️ Flight Report: Dubai/Doha → Thailand"
  echo "**Generated:** $DATE"
  echo ""
  echo "### Context"
  echo "Monitoring flight routes from Dubai (DXB) and Doha (DOH) to Thailand due to Middle East situation."
  echo ""
  echo "### Data Collection"
  echo "- ⚠️ Requires FlightAware API key (not configured yet)"
  echo "- ⚠️ Requires NOTAM database access"
  echo "- ⚠️ Requires war-situation news feeds"
  echo ""
  echo "**Status:** Setup pending — waiting for API keys"
  echo ""
} >> "$REPORT_FILE"

echo "Report appended to $REPORT_FILE"
