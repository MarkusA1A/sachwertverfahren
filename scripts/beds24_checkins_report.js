#!/usr/bin/env node
/**
 * Beds24 Daily Check-in/Check-out Report
 * Fetches bookings for today and sends morning summary
 * Uses Beds24 API v2 (same format as Python script)
 */

const https = require('https');
const querystring = require('querystring');

const BEDS24_API_KEY = 'UuOQXL5fCH0NhwFVeuEvrQxo//MDry2lrAiO4EGILOJVWnv+IemQDdTn10GsRTQ45P+8A+moODihuOPxxG001pMiuEs6Tqt/TtnIutEmeJuoLab+0xEBS/v23t+kbTvy7RwLr47gFqGqITsQl6G0LorcV+geDL/SPbjIqfWN5aU=';
const BEDS24_API_URL = 'https://beds24.com/api/v2';
const TELEGRAM_ID = '8279059377';

function beds24Request(path, params = {}) {
  return new Promise((resolve, reject) => {
    // Add params to URL if provided
    const query = querystring.stringify(params);
    const fullUrl = query ? `${BEDS24_API_URL}${path}?${query}` : `${BEDS24_API_URL}${path}`;
    
    const urlObj = new URL(fullUrl);
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      headers: {
        'token': BEDS24_API_KEY,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    };

    https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed);
        } catch (e) {
          reject(new Error(`Parse error: ${e.message}`));
        }
      });
    }).on('error', reject).end();
  });
}

async function getBookingsForToday() {
  try {
    const today = new Date().toISOString().split('T')[0];

    // Get bookings arriving today
    const arrivalsResp = await beds24Request('/bookings', {
      arrivalFrom: today,
      arrivalTo: today,
      includeInvoice: 'false',
      includeInfoItems: 'false'
    });

    // Get bookings departing today
    const departuresResp = await beds24Request('/bookings', {
      departureFrom: today,
      departureTo: today,
      includeInvoice: 'false',
      includeInfoItems: 'false'
    });

    if (!arrivalsResp.success || !departuresResp.success) {
      throw new Error(`API error: ${JSON.stringify(arrivalsResp.error || departuresResp.error)}`);
    }

    const checkIns = arrivalsResp.data || [];
    const checkOuts = departuresResp.data || [];

    // Remove duplicates (some bookings might appear in both if arrival = departure)
    const checkOutIds = new Set(checkOuts.map(b => b.id));
    const checkInsFiltered = checkIns.filter(b => !checkOutIds.has(b.id));

    return { checkIns: checkInsFiltered, checkOuts };
  } catch (error) {
    console.error('Error fetching bookings:', error.message);
    throw error;
  }
}

const PROPERTY_NAMES = {
  74417: 'Appartements beim LKH',
  142535: 'City Appartements Weiz'
};

function getGuestName(booking) {
  const first = booking.firstName || '';
  const last = booking.lastName || '';
  const full = (first + ' ' + last).trim();
  return full || 'Unnamed Guest';
}

function getPropertyName(booking) {
  return PROPERTY_NAMES[booking.propertyId] || `Property ${booking.propertyId}`;
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
        'Content-Length': Buffer.byteLength(data)
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

async function generateDailyReport() {
  try {
    const { checkIns, checkOuts } = await getBookingsForToday();

    const today = new Date().toLocaleDateString('de-AT', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    const line = '━━━━━━━━━━━━━━━━━━━━';
    let message = `🏨 <b>Tagesreport</b>\n<i>${today}</i>\n${line}\n\n`;

    if (checkIns.length === 0 && checkOuts.length === 0) {
      message += '✅ Ruhiger Tag — keine Bewegungen heute.';
    } else {
      if (checkIns.length > 0) {
        message += `✈️ <b>Check-in${checkIns.length > 1 ? 's' : ''} (${checkIns.length})</b>\n`;
        checkIns.forEach(booking => {
          const guestName = getGuestName(booking);
          const propName = getPropertyName(booking);
          message += `┌ 👤 <b>${guestName}</b>\n└ 📍 ${propName}\n\n`;
        });
      }

      if (checkOuts.length > 0) {
        message += `🚪 <b>Check-out${checkOuts.length > 1 ? 's' : ''} (${checkOuts.length})</b>\n`;
        checkOuts.forEach(booking => {
          const guestName = getGuestName(booking);
          const propName = getPropertyName(booking);
          message += `┌ 👤 <b>${guestName}</b>\n└ 📍 ${propName}\n\n`;
        });
      }

      message = message.trimEnd();
    }

    console.log(message);
    await sendTelegram(message);
    console.log('✅ Beds24 report sent');

  } catch (error) {
    console.error('❌ Error:', error.message);
    const msg = `❌ <b>Beds24 Report Fehler</b>\n${error.message}`;
    await sendTelegram(msg).catch(() => {});
  }
}

// Run if executed directly
if (require.main === module) {
  generateDailyReport().catch(console.error);
}

module.exports = { getBookingsForToday };
