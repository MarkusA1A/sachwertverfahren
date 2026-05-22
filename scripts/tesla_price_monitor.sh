#!/bin/bash

# Tesla Supercharger Price Monitor for Graz
# Uses Chargeprice API for reliable pricing data

PRICE_THRESHOLD=0.35  # 35 cents per kWh
PRICE_THRESHOLD_CT=35
CACHE_FILE="/Users/macmini/.openclaw/workspace/.tesla_price_cache"
LOG_FILE="/Users/macmini/.openclaw/workspace/.tesla_monitor.log"

# Chargeprice API credentials
API_KEY="2d4c280327356010013fd4bbf7557f3b"
API_BASE="https://api.chargeprice.net/v1"

# Graz coordinates for Tesla Webling Supercharger
LATITUDE="47.1292"
LONGITUDE="15.5020"

# Function to fetch Tesla Supercharger pricing via Chargeprice API
get_tesla_graz_price() {
    # Query Chargeprice for charging stations near Graz
    RESPONSE=$(curl -s \
        -H "Authorization: Bearer ${API_KEY}" \
        -H "Accept: application/json" \
        "${API_BASE}/charging_stations?latitude=${LATITUDE}&longitude=${LONGITUDE}&radius=5&limit=10" 2>/dev/null)
    
    if [ -z "$RESPONSE" ]; then
        echo "ERROR: API request failed"
        return 1
    fi
    
    # Check for errors in response
    if echo "$RESPONSE" | grep -q "error\|unauthorized\|forbidden"; then
        echo "ERROR: API authentication failed"
        return 1
    fi
    
    # Find Tesla Supercharger in results
    TESLA_STATION=$(echo "$RESPONSE" | grep -o '"provider":"Tesla"' | head -1)
    
    if [ -z "$TESLA_STATION" ]; then
        echo "NO_TESLA_FOUND"
        return 1
    fi
    
    # Extract station ID and fetch tariff details
    STATION_ID=$(echo "$RESPONSE" | grep -oE '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
    
    if [ -z "$STATION_ID" ]; then
        echo "ERROR: Could not extract station ID"
        return 1
    fi
    
    # Fetch pricing for this station
    TARIFF_RESPONSE=$(curl -s \
        -H "Authorization: Bearer ${API_KEY}" \
        -H "Accept: application/json" \
        "${API_BASE}/charge_prices?station_id=${STATION_ID}&electric_vehicle_db_id=1" 2>/dev/null)
    
    if [ -z "$TARIFF_RESPONSE" ]; then
        echo "ERROR: Tariff request failed"
        return 1
    fi
    
    # Extract the price (look for kWh-based pricing)
    PRICE=$(echo "$TARIFF_RESPONSE" | grep -oE '"total":[0-9]+\.[0-9]+' | head -1 | cut -d: -f2)
    
    if [ -z "$PRICE" ]; then
        # Fallback: try to get per-minute pricing and estimate
        PRICE=$(echo "$TARIFF_RESPONSE" | grep -oE '[0-9]+\.[0-9]+' | head -1)
    fi
    
    echo "$PRICE"
}

echo "$(date '+%Y-%m-%d %H:%M:%S') - Starting Tesla Graz monitor..." >> "$LOG_FILE"

CURRENT_PRICE=$(get_tesla_graz_price)

if [[ "$CURRENT_PRICE" == ERROR* ]] || [ "$CURRENT_PRICE" = "NO_TESLA_FOUND" ] || [ -z "$CURRENT_PRICE" ]; then
    echo "$(date '+%Y-%m-%d %H:%M:%S') - ⚠️ Could not fetch Tesla pricing: $CURRENT_PRICE" | tee -a "$LOG_FILE"
    exit 0
fi

# Convert to numeric (handle both comma and dot)
PRICE_NUM=$(echo "$CURRENT_PRICE" | sed 's/,/\./')

# Load last known price
LAST_PRICE=""
if [ -f "$CACHE_FILE" ]; then
    LAST_PRICE=$(cat "$CACHE_FILE")
fi

# Format display price (convert euros to ct if needed)
if (( $(echo "$PRICE_NUM > 1" | bc -l) )); then
    # Price is in euros, convert to readable format
    DISPLAY_PRICE="${PRICE_NUM}€/kWh"
    PRICE_CT=$(echo "$PRICE_NUM * 100" | bc)
else
    # Price is already in cents or as fraction
    DISPLAY_PRICE="${PRICE_NUM}€/kWh"
    PRICE_CT=$(echo "$PRICE_NUM * 100" | bc)
fi

# Check threshold
if (( $(echo "$PRICE_NUM < $PRICE_THRESHOLD" | bc -l) )); then
    MSG="🔋 Tesla Graz: ${DISPLAY_PRICE} — UNTER ${PRICE_THRESHOLD_CT}ct! 🚀 Jetzt laden!"
    echo "$(date '+%Y-%m-%d %H:%M:%S') - ALERT: $MSG" >> "$LOG_FILE"
    echo "$MSG"
else
    MSG="⚡ Tesla Graz: ${DISPLAY_PRICE} (Ziel: <${PRICE_THRESHOLD_CT}ct) — noch zu teuer"
    echo "$(date '+%Y-%m-%d %H:%M:%S') - Status: $MSG" >> "$LOG_FILE"
    
    # Only output if price changed
    if [ "$LAST_PRICE" != "$CURRENT_PRICE" ]; then
        echo "$MSG"
    fi
fi

# Update cache
echo "$CURRENT_PRICE" > "$CACHE_FILE"
echo "$(date '+%Y-%m-%d %H:%M:%S') - Price cached: $CURRENT_PRICE" >> "$LOG_FILE"
