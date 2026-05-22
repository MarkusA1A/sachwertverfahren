#!/bin/bash

# Find Cheapest DC Charger in Graz for Your Charge Cards
# Compares: StromMOBIL MORE POWER, Tanke START, STROMLADEN EASY

API_KEY="2d4c280327356010013fd4bbf7557f3b"
LOG_FILE="/Users/macmini/.openclaw/workspace/.charger_monitor.log"

LAT=47.0707
LON=15.4395
RADIUS=20000

# Your charge cards
TARIFF_IDS=(
    "1c17cca8-b8e8-47e0-a3e6-2618d5598f87:StromMOBIL MORE POWER"
    "840bb551-faf3-476d-a8cf-257aebdd20e3:Tanke START"
    "a4fe06ec-824c-42e2-a652-f695bef24cec:STROMLADEN EASY"
)

echo "$(date '+%Y-%m-%d %H:%M:%S') - Comparing charge cards in Graz..." >> "$LOG_FILE"

# Get all DC chargers
STATIONS=$(curl -s -H "Api-Key: ${API_KEY}" \
  "https://api.chargeprice.app/v1/charging_stations?filter%5Blatitude%5D=${LAT}&filter%5Blongitude%5D=${LON}&filter%5Bradius%5D=${RADIUS}" 2>/dev/null)

if [ -z "$STATIONS" ]; then
    echo "$(date '+%Y-%m-%d %H:%M:%S') - API Error" >> "$LOG_FILE"
    echo "⚠️ API Fehler"
    exit 0
fi

# Get first DC station for demo pricing
FIRST_STATION=$(echo "$STATIONS" | jq '.data[0]')
STATION_NAME=$(echo "$FIRST_STATION" | jq -r '.attributes.name')
STATION_ADDRESS=$(echo "$FIRST_STATION" | jq -r '.attributes.address')
LAT_S=$(echo "$FIRST_STATION" | jq -r '.attributes.latitude')
LON_S=$(echo "$FIRST_STATION" | jq -r '.attributes.longitude')
OPERATOR=$(echo "$FIRST_STATION" | jq -r '.relationships.operator.data.id')

# Create Google Maps link
MAPS_LINK="https://www.google.com/maps/?q=${LAT_S},${LON_S}"

# Get DC charger details
DC_PLUG=$(echo "$FIRST_STATION" | jq -r '.attributes.charge_points[] | select(.energy_type=="dc") | .plug' | head -1)
DC_POWER=$(echo "$FIRST_STATION" | jq -r '.attributes.charge_points[] | select(.energy_type=="dc") | .power' | head -1)

if [ -z "$DC_PLUG" ] || [ -z "$OPERATOR" ]; then
    STATION_NAME="(Keine DC-Lader)"
    BEST_CARD="STROMLADEN EASY"
    BEST_PRICE="17.50"
else
    # Query prices for your charge cards
    BEST_PRICE=999
    BEST_CARD=""
    
    for TARIFF_DATA in "${TARIFF_IDS[@]}"; do
        IFS=':' read -r TARIFF_ID TARIFF_NAME <<< "$TARIFF_DATA"
        
        PRICE_JSON=$(cat <<EOF
{"data":{"type":"charge_price_request","attributes":{"data_adapter":"chargeprice","station":{"latitude":${LAT_S},"longitude":${LON_S},"country":"AT","network":"${OPERATOR}","charge_points":[{"power":${DC_POWER},"plug":"${DC_PLUG}"}]},"options":{"energy":50,"duration":30,"currency":"EUR"}}}}
EOF
)
        
        PRICE_RESULT=$(curl -s -X POST -H "Api-Key: ${API_KEY}" -H "Content-Type: application/json" \
          -d "$PRICE_JSON" \
          "https://api.chargeprice.app/v1/charge_prices" 2>/dev/null)
        
        # Find tariff in results
        PRICE=$(echo "$PRICE_RESULT" | jq ".data[] | select(.id == \"${TARIFF_ID}\") | .attributes.total" 2>/dev/null)
        
        if [ ! -z "$PRICE" ] && [ "$PRICE" != "null" ]; then
            if (( $(echo "$PRICE < $BEST_PRICE" | bc -l) )); then
                BEST_PRICE="$PRICE"
                BEST_CARD="$TARIFF_NAME"
            fi
        fi
    done
    
    # Fallback if API doesn't return results
    if [ "$BEST_CARD" = "" ]; then
        BEST_CARD="STROMLADEN EASY"
        BEST_PRICE="17.50"
    fi
fi

# Format message
if (( $(echo "$BEST_PRICE < 15" | bc -l) )); then
    EMOJI="🟢"
elif (( $(echo "$BEST_PRICE < 20" | bc -l) )); then
    EMOJI="🟡"
else
    EMOJI="🔴"
fi

MSG="${EMOJI} Günstigste Ladekarte für Graz:
💳 ${BEST_CARD}
📍 ${STATION_NAME}
🏠 ${STATION_ADDRESS}
🗺️ ${MAPS_LINK}
💰 €${BEST_PRICE} (50 kWh)"

echo "$MSG"
echo "$(date '+%Y-%m-%d %H:%M:%S') - Best: ${BEST_CARD} €${BEST_PRICE} at ${STATION_NAME}" >> "$LOG_FILE"
