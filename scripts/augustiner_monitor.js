#!/usr/bin/env node

/**
 * Augustiner Alkoholfrei Monitor
 * Sucht täglich wo man Augustiner Alkoholfrei in Österreich kaufen kann
 */

const https = require("https");
const fs = require("fs");
const path = require("path");

// Load .env.local
const envPath = path.join(__dirname, ".env.local");
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf-8");
  envContent.split("\n").forEach((line) => {
    const [key, value] = line.split("=");
    if (key && value) {
      process.env[key.trim()] = value.trim();
    }
  });
}

const CONFIG = {
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
  TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID || "8279059377",
  LOG_FILE: path.join(__dirname, ".augustiner_monitor.log"),
};

function log(msg) {
  const ts = new Date().toISOString().replace("T", " ").slice(0, 19);
  const entry = `[${ts}] ${msg}`;
  console.log(entry);
  fs.appendFileSync(CONFIG.LOG_FILE, entry + "\n");
}

function sendTelegram(message) {
  return new Promise((resolve, reject) => {
    if (!CONFIG.TELEGRAM_BOT_TOKEN) {
      reject(new Error("TELEGRAM_BOT_TOKEN not set"));
      return;
    }

    const payload = JSON.stringify({
      chat_id: CONFIG.TELEGRAM_CHAT_ID,
      text: message,
      parse_mode: "HTML",
    });

    const options = {
      hostname: "api.telegram.org",
      path: `/bot${CONFIG.TELEGRAM_BOT_TOKEN}/sendMessage`,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": payload.length,
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => {
        if (res.statusCode === 200) {
          resolve();
        } else {
          reject(new Error(`Telegram error: ${res.statusCode}`));
        }
      });
    });

    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

// Search for Augustiner in Austria using DuckDuckGo
async function searchAugustiner() {
  log("Starting Augustiner monitor...");

  try {
    const { chromium } = require("playwright");
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    page.setDefaultTimeout(60000);

    // Multiple search queries
    const queries = [
      "Augustiner alkoholfrei Österreich kaufen online",
      "Augustiner alcohol free Austria shop",
      "wo kauft man Augustiner alkoholfrei in Österreich",
    ];

    const results = [];

    for (const query of queries) {
      const searchUrl = `https://duckduckgo.com/?q=${encodeURIComponent(query)}&ia=web`;

      log(`Searching: ${query}`);

      try {
        await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
        await page.waitForTimeout(1000);

        // Extract search results
        const links = await page.evaluate(() => {
          const items = [];
          const results = document.querySelectorAll("a.result__a");

          results.forEach((link) => {
            const title = link.textContent.trim();
            const href = link.getAttribute("href");

            // Filter for Austrian/relevant results
            if (
              href &&
              (href.includes(".at") ||
                href.includes("österreich") ||
                href.includes("austria") ||
                title.toLowerCase().includes("österreich") ||
                title.toLowerCase().includes("austria"))
            ) {
              items.push({ title, url: href });
            }
          });

          return items.slice(0, 3);
        });

        results.push(...links);
      } catch (err) {
        log(`Search timeout for query: ${query} (continuing...)`);
      }
    }

    await browser.close();

    // Deduplicate
    const unique = [];
    const seen = new Set();
    for (const r of results) {
      if (!seen.has(r.url)) {
        unique.push(r);
        seen.add(r.url);
      }
    }

    log(`Found ${unique.length} results`);

    if (unique.length === 0) {
      log("No results found, sending generic message");
      const message =
        `🍺 <b>Augustiner Alkoholfrei Österreich</b>\n\n` +
        `Ich konnte keine aktuellen Angebote im Web finden.\n\n` +
        `<b>Empfehlungen:</b>\n` +
        `🛒 Amazon.at\n` +
        `🛒 Bipa.at\n` +
        `🛒 DM.at\n` +
        `🛒 Lokale Supermärkte\n\n` +
        `<i>Versuch selbst zu suchen mit: "Augustiner alkoholfrei Österreich"</i>`;

      await sendTelegram(message);
      log("Sent generic message");
      process.exit(0);
    }

    // Format Telegram message
    let telegramMsg =
      `🍺 <b>Augustiner Alkoholfrei in Österreich</b>\n\n` +
      `<b>Gefundene Angebote:</b>\n\n`;

    unique.slice(0, 5).forEach((item, idx) => {
      const cleanUrl = item.url
        .replace(/https?:\/\/(www\.)?/, "")
        .replace(/\/.*/,"");
      telegramMsg += `${idx + 1}. <a href="${item.url}">${item.title.slice(0, 50)}</a>\n`;
      telegramMsg += `   📍 ${cleanUrl}\n\n`;
    });

    telegramMsg += `<i>Aktualisiert: ${new Date().toLocaleString("de-AT")}</i>`;

    await sendTelegram(telegramMsg);
    log(`Sent ${unique.length} results via Telegram`);

    process.exit(0);
  } catch (error) {
    log(`ERROR: ${error.message}`);
    process.exit(1);
  }
}

searchAugustiner();
