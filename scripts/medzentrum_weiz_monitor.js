#!/usr/bin/env node

/**
 * MedZentrum Weiz - Besucherzähler Monitor
 * Täglich 23:30: Aktuelle Besucherzahlen abfragen
 * Freitag: + Wochensumme (Mo-Fr)
 * Letzter Monatstag: + Monatssumme + YTD-Summe
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

// Load .env.local
const envPath = path.join(__dirname, '.env.local');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const [key, ...val] = line.split('=');
    if (key && val.length) process.env[key.trim()] = val.join('=').trim();
  });
}

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = '8279059377';
const BASE_URL = 'counter.medzentrum-weiz.at';

// Telegram Nachricht senden
async function sendTelegram(message) {
  if (!TELEGRAM_BOT_TOKEN) {
    console.log('[WARN] TELEGRAM_BOT_TOKEN nicht gesetzt, skipping notification');
    return;
  }

  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  const data = JSON.stringify({
    chat_id: TELEGRAM_CHAT_ID,
    text: message,
    parse_mode: 'HTML'
  });

  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        console.log('[INFO] Telegram response:', body);
        resolve(body);
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// API-Abfrage
function fetchJSON(path) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: BASE_URL,
      path: path,
      method: 'GET',
      headers: { 'User-Agent': 'Mozilla/5.0' },
      timeout: 10000
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`JSON parse error: ${e.message} — raw: ${data.substring(0, 200)}`));
        }
      });
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.on('error', reject);
    req.end();
  });
}

// Hilfsfunktionen
function getTodayDate() {
  const now = new Date();
  // Lokale Zeit in Wien berücksichtigen
  return now.toISOString().split('T')[0];
}

function isFriday(dateStr) {
  return new Date(dateStr + 'T12:00:00').getDay() === 5;
}

function isLastDayOfMonth(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  return d.getDate() === lastDay;
}

function getDayName(dateStr) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('de-AT', {
    weekday: 'long', day: 'numeric', month: 'numeric', year: 'numeric'
  });
}

// Main
async function main() {
  const today = getTodayDate();
  console.log(`[INFO] MedZentrum Weiz Monitor - ${today}`);

  // Live-Daten abrufen
  let live;
  try {
    live = await fetchJSON('/api/live');
    console.log('[INFO] Live data:', JSON.stringify(live));
  } catch (err) {
    console.error('[ERROR] Live fetch failed:', err.message);
    await sendTelegram('❌ MedZentrum Weiz Monitor: Konnte Live-Daten nicht abrufen.\n' + err.message);
    return;
  }

  const countIn = live?.current?.count_in ?? '--';
  const countOut = live?.current?.count_out ?? '--';
  const occupancy = live?.current?.occupancy ?? '--';

  let message = `🏥 <b>MedZentrum Weiz — Besucherzähler</b>\n\n`;
  message += `📅 <b>${getDayName(today)}</b>\n\n`;
  message += `👥 Eingetreten heute: <b>${countIn}</b>\n`;
  message += `🚪 Verlassen heute: <b>${countOut}</b>\n`;
  message += `🏢 Aktuell im Gebäude: <b>${occupancy}</b>\n`;

  // Freitag: Wochensumme Mo-Fr
  if (isFriday(today)) {
    try {
      const weekData = await fetchJSON('/api/stats/week');
      console.log('[INFO] Week data:', JSON.stringify(weekData));

      if (weekData?.days) {
        // Nur Mo-Fr (Wochentag 1-5)
        const weekdays = weekData.days.filter(d => {
          const dow = new Date(d.date + 'T12:00:00').getDay();
          return dow >= 1 && dow <= 5;
        });

        const weekSumIn = weekdays.reduce((sum, d) => sum + (d.total_in || 0), 0);
        const weekSumOut = weekdays.reduce((sum, d) => sum + (d.total_out || 0), 0);

        message += `\n📊 <b>Wochensumme (Mo–Fr)</b>\n`;
        message += `   Eingetreten: <b>${weekSumIn}</b>\n`;
        message += `   Verlassen: <b>${weekSumOut}</b>\n`;
      }
    } catch (err) {
      console.error('[ERROR] Week fetch failed:', err.message);
      message += `\n⚠️ Wochendaten nicht verfügbar\n`;
    }
  }

  // Letzter Monatstag: Monatssumme + YTD
  if (isLastDayOfMonth(today)) {
    const d = new Date(today + 'T12:00:00');
    const year = d.getFullYear();
    const month = d.getMonth() + 1;

    try {
      const monthData = await fetchJSON(`/api/stats/month?year=${year}&month=${month}`);
      console.log('[INFO] Month data:', JSON.stringify(monthData));

      if (monthData?.days) {
        const monthSumIn = monthData.days.reduce((sum, d) => sum + (d.total_in || 0), 0);
        const monthSumOut = monthData.days.reduce((sum, d) => sum + (d.total_out || 0), 0);

        message += `\n📈 <b>Monatssumme ${month}/${year}</b>\n`;
        message += `   Eingetreten: <b>${monthSumIn}</b>\n`;
        message += `   Verlassen: <b>${monthSumOut}</b>\n`;
      }
    } catch (err) {
      console.error('[ERROR] Month fetch failed:', err.message);
      message += `\n⚠️ Monatsdaten nicht verfügbar\n`;
    }

    // YTD: Alle Monate bis jetzt
    try {
      let ytdIn = 0;
      let ytdOut = 0;
      const currentMonth = new Date(today + 'T12:00:00').getMonth() + 1;
      const currentYear = new Date(today + 'T12:00:00').getFullYear();

      for (let m = 1; m <= currentMonth; m++) {
        const mData = await fetchJSON(`/api/stats/month?year=${currentYear}&month=${m}`);
        if (mData?.days) {
          ytdIn += mData.days.reduce((sum, d) => sum + (d.total_in || 0), 0);
          ytdOut += mData.days.reduce((sum, d) => sum + (d.total_out || 0), 0);
        }
      }

      message += `\n📅 <b>YTD ${currentYear}</b>\n`;
      message += `   Eingetreten: <b>${ytdIn}</b>\n`;
      message += `   Verlassen: <b>${ytdOut}</b>\n`;
    } catch (err) {
      console.error('[ERROR] YTD fetch failed:', err.message);
      message += `\n⚠️ YTD-Daten nicht verfügbar\n`;
    }
  }

  console.log('[INFO] Sending message:', message);
  await sendTelegram(message);
}

main().catch(err => {
  console.error('[ERROR]', err);
  process.exit(1);
});
