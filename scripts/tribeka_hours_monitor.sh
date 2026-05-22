#!/bin/bash

# Tribeka Café (Technikerstraße) Öffnungszeiten Monitor
# Überwacht täglich auf geänderte Öffnungszeiten

CACHE_FILE="/Users/macmini/.openclaw/workspace/.tribeka_hours_cache"
WEBSITE="https://www.tribeka.at"

# Website abrufen und Technikerstraße-Öffnungszeiten extrahieren
CURRENT_HOURS=$(curl -s "$WEBSITE" | grep -A 10 "Technikerstraße" | grep -E "(Mo|07:00|19:00)" | tr -s ' ' | head -5 | md5sum | awk '{print $1}')

if [ -f "$CACHE_FILE" ]; then
    LAST_HOURS=$(cat "$CACHE_FILE")
    if [ "$CURRENT_HOURS" != "$LAST_HOURS" ]; then
        echo "$CURRENT_HOURS" > "$CACHE_FILE"
        
        # Abrufen der aktuellen Zeiten für Benachrichtigung
        HOURS_TEXT=$(curl -s "$WEBSITE" | grep -A 10 "Technikerstraße" | grep -E "(Mo|Sa|07:00|08:00|19:00|20:00)" | sed 's/<[^>]*>//g' | tr -s ' ' | head -10)
        
        echo "🕐 Tribeka Technikerstraße: Öffnungszeiten geändert!
        
$HOURS_TEXT"
    fi
else
    echo "$CURRENT_HOURS" > "$CACHE_FILE"
fi
