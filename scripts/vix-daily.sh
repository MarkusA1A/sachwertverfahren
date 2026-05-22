#!/bin/bash

# VIX Daily Report Script
# Runs: Monday-Friday at 18:00 Vienna Time
# Sends VIX price + change to Telegram via OpenClaw

TIMEZONE="Europe/Vienna"

# Get VIX data from financial API
get_vix() {
    # Using Alpha Vantage API (free tier available)
    # Alternative: curl -s "https://api.example.com/vix" | jq
    
    # Simple approach: fetch from Yahoo Finance equivalent
    VIX_DATA=$(curl -s "https://query1.finance.yahoo.com/v10/finance/quoteSummary/%5EVIX?modules=price" 2>/dev/null)
    
    if [ -z "$VIX_DATA" ]; then
        # Fallback: Try investing.com scraping
        VIX_DATA=$(curl -s -H "User-Agent: Mozilla/5.0" "https://www.investing.com/indices/volatility-s-p-500" 2>/dev/null)
    fi
    
    echo "$VIX_DATA"
}

# Parse VIX price
parse_vix() {
    local data="$1"
    
    # Try JSON parsing first
    local price=$(echo "$data" | grep -o '"regularMarketPrice":[0-9.]*' | head -1 | cut -d: -f2)
    
    if [ -z "$price" ]; then
        # Fallback: extract from HTML
        price=$(echo "$data" | grep -o 'class="last-price">[^<]*' | sed 's/.*>//' | tr -d ' ')
    fi
    
    echo "$price"
}

# Get VIX change
parse_vix_change() {
    local data="$1"
    
    local change=$(echo "$data" | grep -o '"regularMarketChange":[^,}]*' | cut -d: -f2)
    
    if [ -z "$change" ]; then
        change=$(echo "$data" | grep -o 'class="percent">[^<]*' | sed 's/.*>//' | tr -d ' ')
    fi
    
    echo "$change"
}

# Main
main() {
    echo "🕐 VIX Daily Report - $(date '+%Y-%m-%d %H:%M' --date="TZ=$TIMEZONE")"
    
    # Fetch VIX
    VIX_DATA=$(get_vix)
    VIX_PRICE=$(parse_vix "$VIX_DATA")
    VIX_CHANGE=$(parse_vix_change "$VIX_DATA")
    
    if [ -z "$VIX_PRICE" ]; then
        VIX_PRICE="ERROR"
        VIX_CHANGE="Data unavailable"
    fi
    
    # Format message
    MSG="📊 VIX Stand - $(date '+%d.%m.%Y %H:%M' --date="TZ=$TIMEZONE")
    
💹 VIX: $VIX_PRICE
📈 Änderung: $VIX_CHANGE

🇦🇹 Vienna Time"
    
    # Send via OpenClaw to Telegram
    # This uses OpenClaw's built-in messaging to send to the user
    echo "$MSG"
    
    # Log
    echo "$(date '+%Y-%m-%d %H:%M:%S') - VIX: $VIX_PRICE, Change: $VIX_CHANGE" >> "$HOME/.openclaw/workspace/logs/vix-daily.log"
}

main "$@"
