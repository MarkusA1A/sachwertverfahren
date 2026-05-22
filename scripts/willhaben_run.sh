#!/bin/bash
# Wrapper für Willhaben Monitor Cron Job
set -e

LOG_FILE="/Users/macmini/.openclaw/workspace/scripts/.willhaben_monitor.log"
SCRIPT="/Users/macmini/.openclaw/workspace/scripts/willhaben_immobilien_monitor.js"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting Willhaben monitor (cron trigger)..." >> "$LOG_FILE"

# Set Telegram token
export TELEGRAM_BOT_TOKEN="8715573509:AAEag1zNjWw3I4DGUTfMnQ2R0NJjld_NPDM"
export TELEGRAM_CHAT_ID="8279059377"

# Run Node.js script
cd /Users/macmini/.openclaw/workspace/scripts
node "$SCRIPT" >> "$LOG_FILE" 2>&1

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Willhaben monitor finished." >> "$LOG_FILE"
