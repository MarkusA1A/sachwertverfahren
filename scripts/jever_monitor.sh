#!/bin/bash

# Jever Alkoholfrei Monitor - Check Getränkebote.at for availability

LOG_FILE="/Users/macmini/.openclaw/workspace/.jever_monitor.log"
CACHE_FILE="/Users/macmini/.openclaw/workspace/.jever_cache"

echo "$(date '+%Y-%m-%d %H:%M:%S') - Checking Jever availability at Getränkebote..." >> "$LOG_FILE"

# Fetch the alkoholfrei beer section
PAGE=$(curl -s -A "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)" \
  "https://www.getraenkebote.at/shop/category/bier-alkoholfreies-bier-8" 2>/dev/null)

if [ -z "$PAGE" ]; then
    echo "$(date '+%Y-%m-%d %H:%M:%S') - ERROR: Could not fetch page" >> "$LOG_FILE"
    echo "⚠️ Getränkebote nicht erreichbar"
    exit 0
fi

# Search for Jever (case-insensitive)
JEVER_FOUND=$(echo "$PAGE" | grep -i "jever" | head -5)

if [ -z "$JEVER_FOUND" ]; then
    CURRENT_STATUS="NOT_FOUND"
    STATUS_MSG="❌ Jever alkoholfrei nicht im Angebot"
else
    # Check if product is available (not "nicht auf Lager" or similar)
    JEVER_SECTION=$(echo "$PAGE" | grep -i "jever" -A 10 -B 2 | head -20)
    
    if echo "$JEVER_SECTION" | grep -qi "nicht auf lager\|ausverkauft\|nicht verfügbar"; then
        CURRENT_STATUS="OUT_OF_STOCK"
        STATUS_MSG="⚠️ Jever gefunden, aber ausverkauft"
    else
        CURRENT_STATUS="AVAILABLE"
        
        # Try to extract price and details
        PRICE=$(echo "$JEVER_SECTION" | grep -oE "€ ?[0-9]+[,\.][0-9]{2}" | head -1)
        if [ -z "$PRICE" ]; then
            PRICE="(Preis nicht erkannt)"
        fi
        
        STATUS_MSG="✅ Jever alkoholfrei verfügbar! ${PRICE}"
    fi
fi

# Check last status
LAST_STATUS=""
if [ -f "$CACHE_FILE" ]; then
    LAST_STATUS=$(cat "$CACHE_FILE")
fi

# Only send message if status changed
if [ "$CURRENT_STATUS" != "$LAST_STATUS" ]; then
    echo "$STATUS_MSG"
    echo "$(date '+%Y-%m-%d %H:%M:%S') - Status changed: $CURRENT_STATUS (was: $LAST_STATUS)" >> "$LOG_FILE"
else
    echo "$(date '+%Y-%m-%d %H:%M:%S') - Status unchanged: $CURRENT_STATUS" >> "$LOG_FILE"
fi

# Update cache
echo "$CURRENT_STATUS" > "$CACHE_FILE"
