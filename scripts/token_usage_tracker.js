#!/usr/bin/env node
/**
 * Daily Token Usage Tracker
 * Aggregates token usage from various sources and sends evening summary
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const TELEGRAM_ID = '8279059377';
const USAGE_LOG = path.join(process.env.HOME, '.openclaw/workspace/logs/token_usage.jsonl');
const USAGE_DIR = path.join(process.env.HOME, '.openclaw/workspace/logs');

// Ensure logs directory exists
if (!fs.existsSync(USAGE_DIR)) {
  fs.mkdirSync(USAGE_DIR, { recursive: true });
}

function logTokenUsage(source, tokens, metadata = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    date: new Date().toISOString().split('T')[0],
    source,
    tokens,
    metadata
  };
  
  if (!fs.existsSync(USAGE_LOG)) {
    fs.writeFileSync(USAGE_LOG, '');
  }
  
  fs.appendFileSync(USAGE_LOG, JSON.stringify(entry) + '\n');
}

function getTodayUsage() {
  if (!fs.existsSync(USAGE_LOG)) {
    return { total: 0, bySource: {}, sessions: [] };
  }

  const today = new Date().toISOString().split('T')[0];
  const lines = fs.readFileSync(USAGE_LOG, 'utf8').split('\n').filter(l => l.trim());
  
  let total = 0;
  const bySource = {};
  const sessions = [];

  lines.forEach(line => {
    try {
      const entry = JSON.parse(line);
      if (entry.date === today) {
        total += entry.tokens || 0;
        bySource[entry.source] = (bySource[entry.source] || 0) + (entry.tokens || 0);
        if (entry.metadata.sessionId) {
          sessions.push({
            id: entry.metadata.sessionId,
            tokens: entry.tokens,
            type: entry.metadata.type || 'unknown'
          });
        }
      }
    } catch (e) {
      // Ignore parse errors
    }
  });

  return { total, bySource, sessions };
}

function estimateCost(tokens) {
  // Anthropic pricing (as of May 2026)
  const rates = {
    haiku: 0.80 / 1_000_000,      // $0.80 per 1M input tokens
    sonnet: 3.00 / 1_000_000,     // $3.00 per 1M
    opus: 15.00 / 1_000_000       // $15.00 per 1M
  };
  
  // Estimate based on current usage (mostly Sonnet in background)
  const avgRate = (rates.haiku + rates.sonnet * 2 + rates.opus * 0.5) / 3.5;
  return (tokens * avgRate).toFixed(2);
}

function sendTelegram(message) {
  return new Promise((resolve, reject) => {
    const botToken = process.env.TELEGRAM_BOT_TOKEN || '8715573509:AAEag1zNjWw3I4DGUTfMnQ2R0NJjld_NPDM';
    
    const data = JSON.stringify({
      chat_id: TELEGRAM_ID,
      text: message,
      parse_mode: 'HTML'
    });

    const options = {
      hostname: 'api.telegram.org',
      path: `/bot${botToken}/sendMessage`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve(body));
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function generateDailySummary() {
  try {
    const usage = getTodayUsage();
    const costEstimate = estimateCost(usage.total);
    
    const today = new Date().toLocaleDateString('de-AT', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });

    let message = `📊 <b>Token Usage Summary - ${today}</b>\n\n`;
    message += `<b>Total Tokens:</b> <code>${usage.total.toLocaleString()}</code>\n`;
    message += `<b>Estimated Cost:</b> ~$${costEstimate}\n\n`;

    if (Object.keys(usage.bySource).length > 0) {
      message += `<b>By Source:</b>\n`;
      Object.entries(usage.bySource)
        .sort((a, b) => b[1] - a[1])
        .forEach(([source, tokens]) => {
          const pct = ((tokens / usage.total) * 100).toFixed(1);
          message += `  • ${source}: <code>${tokens.toLocaleString()}</code> (${pct}%)\n`;
        });
    }

    // Budget warning (if over 1M tokens per day)
    if (usage.total > 1_000_000) {
      message += `\n⚠️ <b>High usage day!</b> Consider optimizing.`;
    }

    console.log(message);
    await sendTelegram(message);
    console.log('✅ Daily summary sent');

  } catch (error) {
    console.error('Error:', error.message);
  }
}

// Allow import for logging
module.exports = { logTokenUsage, getTodayUsage };

// Run if executed directly
if (require.main === module) {
  generateDailySummary().catch(console.error);
}
