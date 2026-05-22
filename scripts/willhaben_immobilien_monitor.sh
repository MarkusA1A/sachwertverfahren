#!/bin/bash

# Willhaben.at Immobilien Monitor
# Sucht nach Wohnungen in Graz (50-75 m²) unter 1.400 €/m²
# Benachrichtigung via Telegram

set -e

TELEGRAM_BOT_TOKEN="${TELEGRAM_BOT_TOKEN}"
TELEGRAM_CHAT_ID="8279059377"
SCRIPT_DIR="/Users/macmini/.openclaw/workspace/scripts"
CACHE_FILE="${SCRIPT_DIR}/.willhaben_cache.json"
LOG_FILE="${SCRIPT_DIR}/.willhaben_monitor.log"

# Initialize cache if missing
if [ ! -f "$CACHE_FILE" ]; then
    echo "{}" > "$CACHE_FILE"
fi

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting Willhaben monitor..." >> "$LOG_FILE"

# Willhaben.at Search URL
# Graz (state_id=6), Wohnungen (category=10), Kauf (sales_type=0)
# Größe: floorspace_from=50, floorspace_to=75
# Preis: price_to berechnen wir: 75 m² * 1.400 = 105.000 €
SEARCH_URL="https://www.willhaben.at/iad/immobilien/mietinseratedetail/?search_key=9&state_id=6&category=10&sales_type=0&floorspace_from=50&floorspace_to=75&price_to=105000"

# Fetch page
RESPONSE=$(curl -s -A "Mozilla/5.0" "$SEARCH_URL" 2>&1)

if [ -z "$RESPONSE" ]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: Empty response from willhaben.at" >> "$LOG_FILE"
    exit 1
fi

# Extract listings with jq (extract from HTML/JSON if available)
# Fallback: parse with grep/sed if JSON not available
# Willhaben uses dynamic content, so we need to be careful

# Check if we can extract data
if echo "$RESPONSE" | grep -q "searchresults"; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Found search results" >> "$LOG_FILE"
else
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] No results or page structure changed" >> "$LOG_FILE"
fi

# Parse articles (simplified extraction)
# This is a basic regex approach; willhaben may require more sophisticated parsing
RESULTS=$(echo "$RESPONSE" | grep -oP '(?<=<article)[^>]*(?=>)' 2>/dev/null || echo "")

if [ -z "$RESULTS" ]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] No articles found in page" >> "$LOG_FILE"
    exit 0
fi

# Process each result
NEW_LISTINGS=0
while IFS= read -r article; do
    # Extract ID, title, price, size
    # This requires adapting to actual HTML structure
    LISTING_ID=$(echo "$article" | grep -oP 'id="\K[^"]+' | head -1)
    TITLE=$(echo "$article" | grep -oP 'title="\K[^"]+' | head -1)
    PRICE=$(echo "$article" | grep -oP 'class="price"[^>]*>\K[^<]+' | head -1)
    SIZE=$(echo "$article" | grep -oP 'class="floorspace"[^>]*>\K[^<]+' | head -1)

    # Skip if missing ID
    [ -z "$LISTING_ID" ] && continue

    # Check if already seen
    if jq -e ".\"$LISTING_ID\"" "$CACHE_FILE" > /dev/null 2>&1; then
        continue
    fi

    # Calculate price per m²
    PRICE_CLEAN=$(echo "$PRICE" | tr -dc '0-9')
    SIZE_CLEAN=$(echo "$SIZE" | tr -dc '0-9')

    if [ -n "$PRICE_CLEAN" ] && [ -n "$SIZE_CLEAN" ] && [ "$SIZE_CLEAN" -gt 0 ]; then
        PRICE_PER_M2=$((PRICE_CLEAN / SIZE_CLEAN))

        if [ "$PRICE_PER_M2" -le 1400 ]; then
            # New listing found!
            NEW_LISTINGS=$((NEW_LISTINGS + 1))
            LISTING_URL="https://www.willhaben.at/iad/immobilien/d/$LISTING_ID"

            # Format message
            MESSAGE="🏠 *Neue Immobilie gefunden!*%0A%0A"
            MESSAGE="${MESSAGE}*${TITLE}*%0A"
            MESSAGE="${MESSAGE}💰 ${PRICE_CLEAN} € (${PRICE_PER_M2}€/m²)%0A"
            MESSAGE="${MESSAGE}📐 ${SIZE_CLEAN} m²%0A"
            MESSAGE="${MESSAGE}🔗 <a href=\"${LISTING_URL}\">Link</a>"

            # Send via Telegram
            curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
                -H "Content-Type: application/json" \
                -d "{\"chat_id\": \"$TELEGRAM_CHAT_ID\", \"text\": \"$MESSAGE\", \"parse_mode\": \"HTML\"}" \
                > /dev/null 2>&1

            # Cache entry
            jq --arg id "$LISTING_ID" --arg title "$TITLE" --arg url "$LISTING_URL" \
                '. += {($id): {"title": $title, "url": $url, "timestamp": now | floor}}' \
                "$CACHE_FILE" > "${CACHE_FILE}.tmp" && mv "${CACHE_FILE}.tmp" "$CACHE_FILE"

            echo "[$(date '+%Y-%m-%d %H:%M:%S')] NEW: $LISTING_ID - $TITLE ($PRICE_PER_M2€/m²)" >> "$LOG_FILE"
        fi
    fi
done <<< "$RESULTS"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Monitor completed. Found $NEW_LISTINGS new listings." >> "$LOG_FILE"
