#!/usr/bin/env node
/**
 * Home Assistant Zuhause - Daily Anomaly Check
 * Checks: Low batteries, open doors/windows, temperature anomalies
 */

const https = require('https');
const http = require('http');

const HA_URL = 'http://10.15.1.9:8123';
const HA_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJlMmMwZjEzOGU0Mzc0NzA1OGVlYWQzM2UzZDBiOGE2YyIsImlhdCI6MTc3ODc3NDQ5MCwiZXhwIjoyMDk0MTM0NDkwfQ.592rC1wWx6InVS8jC0QuYRkhZkG5m9xjvH80FBYY62A';
const TELEGRAM_ID = '8279059377';

function fetchHA(path) {
  return new Promise((resolve, reject) => {
    const url = `${HA_URL}${path}`;
    const client = url.startsWith('https') ? https : http;
    const options = {
      headers: { 'Authorization': `Bearer ${HA_TOKEN}` }
    };
    
    client.get(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

async function checkAnomalies() {
  try {
    const states = await fetchHA('/api/states');
    const anomalies = {
      lowBattery: [],
      openDoors: [],
      tempAnomalies: []
    };

    // 1. Check battery status (< 20%)
    states.forEach(entity => {
      const eid = entity.entity_id;
      const state = parseFloat(entity.state);
      const name = entity.attributes?.friendly_name || eid;
      
      // Only check sensor entities ending with _battery or containing battery_level
      if ((eid.match(/battery|batterie/) && (eid.startsWith('sensor.') || eid.startsWith('binary_sensor.'))) && !isNaN(state)) {
        // Exclude battery-type and other non-percentage sensors
        if (!eid.includes('battery_type') && !eid.includes('battery_replaced') && state < 20 && state >= 0) {
          anomalies.lowBattery.push({ name, level: state });
        }
      }
    });

    // 2. Check doors/windows (should be closed during night)
    states.forEach(entity => {
      const eid = entity.entity_id;
      const state = entity.state;
      const name = entity.attributes?.friendly_name || eid;
      const deviceClass = entity.attributes?.device_class || '';
      
      // Only check binary sensors with door/window device class
      if (eid.startsWith('binary_sensor.') && 
          (deviceClass.includes('door') || deviceClass.includes('window') || deviceClass.includes('contact')) &&
          state === 'on') {
        anomalies.openDoors.push({ name });
      }
    });

    // 3. Check temperature anomalies
    const temps = {};
    states.forEach(entity => {
      const eid = entity.entity_id;
      const name = entity.attributes?.friendly_name || eid;
      // Check actual room temperature sensors (Top series thermostats)
      // Only include entity_id that ends with Temperatur and not Luftfeuchtigkeit
      if (eid.startsWith('sensor.') && 
          name.endsWith('Temperatur') && 
          !name.includes('Luftfeuchtigkeit') &&
          !name.includes('Battery')) {
        const state = parseFloat(entity.state);
        if (!isNaN(state) && state > 10 && state < 35) {
          temps[name] = state;
        }
      }
    });

    // Find anomalies: rooms significantly warmer/colder than others
    const tempValues = Object.values(temps);
    if (tempValues.length >= 3) { // Only compare if we have at least 3 rooms
      const avgTemp = tempValues.reduce((a, b) => a + b) / tempValues.length;
      Object.entries(temps).forEach(([name, temp]) => {
        const diff = Math.abs(temp - avgTemp);
        if (diff > 2.5) { // More than 2.5°C difference from average
          anomalies.tempAnomalies.push({ name, temp, avgTemp: avgTemp.toFixed(1), diff: diff.toFixed(1) });
        }
      });
    }

    return anomalies;
  } catch (error) {
    console.error('Error checking anomalies:', error.message);
    throw error;
  }
}

function sendTelegram(message) {
  return new Promise((resolve, reject) => {
    const botToken = process.env.TELEGRAM_BOT_TOKEN || '8715573509:AAEag1zNjWw3I4DGUTfMnQ2R0NJjld_NPDM';
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    
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

function getBoilerTemp(states) {
  // Find Vitodens 200 0821 Vorlauftemperatur (boiler flow temperature)
  for (const entity of states) {
    const name = entity.attributes?.friendly_name || '';
    // Specifically look for Vorlauftemperatur, not Vorlaufdruck (pressure)
    if (name.includes('Vitodens') && name.includes('Vorlauftemperatur')) {
      const state = parseFloat(entity.state);
      if (!isNaN(state) && state > 10 && state < 100) { // Sanity check: reasonable boiler temp
        return state.toFixed(1);
      }
    }
  }
  return null;
}

async function main() {
  try {
    const anomalies = await checkAnomalies();
    const hasIssues = anomalies.lowBattery.length > 0 || 
                     anomalies.openDoors.length > 0 || 
                     anomalies.tempAnomalies.length > 0;

    if (!hasIssues) {
      console.log('✅ Keine Anomalien gefunden');
      return;
    }

    // Get boiler temperature
    const states = await fetchHA('/api/states');
    const boilerTemp = getBoilerTemp(states);
    
    let message = '🔍 <b>Home Assistant Zuhause - Anomalie-Check</b>\n\n';
    if (boilerTemp) {
      message += '🔥 <b>Gastherme (Vorlauf):</b> <code>' + boilerTemp + '°C</code>\n\n';
    }

    if (anomalies.lowBattery.length > 0) {
      message += '🔋 <b>Schwache Batterien:</b>\n';
      anomalies.lowBattery.forEach(item => {
        message += `  • ${item.name}: <b>${item.level}%</b>\n`;
      });
      message += '\n';
    }

    if (anomalies.openDoors.length > 0) {
      message += '🚪 <b>Offene Türen/Fenster:</b>\n';
      anomalies.openDoors.forEach(item => {
        message += `  • ${item.name}\n`;
      });
      message += '\n';
    }

    if (anomalies.tempAnomalies.length > 0) {
      message += '🌡️ <b>Temperatur-Anomalien:</b>\n';
      anomalies.tempAnomalies.forEach(item => {
        message += `  • ${item.name}: <b>${item.temp}°C</b> (Ø ${item.avgTemp}°C, Δ${item.diff}°C)\n`;
      });
    }

    console.log(message);
    await sendTelegram(message);
    console.log('✅ Telegram-Nachricht gesendet');

  } catch (error) {
    console.error('❌ Fehler:', error.message);
    const msg = `❌ <b>HA Anomaly Check Fehler</b>\n${error.message}`;
    await sendTelegram(msg).catch(() => {});
  }
}

main();
