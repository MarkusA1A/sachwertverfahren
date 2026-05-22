#!/usr/bin/env node

/**
 * Willhaben.at Immobilien Monitor
 * Sucht nach Eigentumswohnungen in Graz (50-75 m²) unter 1.400 €/m²
 */

const fs = require("fs");
const path = require("path");
const https = require("https");

// Load .env.local
const envPath = path.join(__dirname, ".env.local");
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf-8");
  envContent.split("\n").forEach((line) => {
    const [key, ...rest] = line.split("=");
    const value = rest.join("=");
    if (key && value) {
      process.env[key.trim()] = value.trim().replace(/^["']|["']$/g, "");
    }
  });
}

const CONFIG = {
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
  TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID || "8279059377",
  CACHE_FILE: path.join(__dirname, ".willhaben_cache.json"),
  LOG_FILE: path.join(__dirname, ".willhaben_monitor.log"),
  // Search criteria
  MIN_SIZE: 50,   // m²
  MAX_SIZE: 75,   // m²
  MAX_PRICE_PER_M2: 1400, // €/m²
};

// Logging
function log(message) {
  const timestamp = new Date().toISOString().replace("T", " ").slice(0, 19);
  const entry = `[${timestamp}] ${message}`;
  console.log(entry);
  fs.appendFileSync(CONFIG.LOG_FILE, entry + "\n");
}

// Load cache
function loadCache() {
  try {
    if (fs.existsSync(CONFIG.CACHE_FILE)) {
      return JSON.parse(fs.readFileSync(CONFIG.CACHE_FILE, "utf-8"));
    }
  } catch (e) {
    log(`Warning: Could not load cache: ${e.message}`);
  }
  return {};
}

// Save cache
function saveCache(cache) {
  try {
    fs.writeFileSync(CONFIG.CACHE_FILE, JSON.stringify(cache, null, 2));
  } catch (e) {
    log(`Warning: Could not save cache: ${e.message}`);
  }
}

// Send Telegram notification
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
      disable_web_page_preview: false,
    });

    const options = {
      hostname: "api.telegram.org",
      path: `/bot${CONFIG.TELEGRAM_BOT_TOKEN}/sendMessage`,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        if (res.statusCode === 200) {
          resolve();
        } else {
          reject(new Error(`Telegram error: ${res.statusCode} - ${data}`));
        }
      });
    });

    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

// Parse Austrian price string like "€ 237.000" or "€ 1.234.567" → number
function parsePrice(text) {
  if (!text) return 0;
  const cleaned = text.replace(/[€\s]/g, "").replace(/\./g, "").replace(",", ".");
  return parseInt(cleaned, 10) || 0;
}

// Parse size string like "50 m²" → number
function parseSize(text) {
  if (!text) return 0;
  const match = text.match(/(\d+[,.]?\d*)/);
  if (!match) return 0;
  return parseFloat(match[1].replace(",", ".")) || 0;
}

// Main function
async function run() {
  log("Starting Willhaben monitor...");

  if (!CONFIG.TELEGRAM_BOT_TOKEN) {
    log("ERROR: TELEGRAM_BOT_TOKEN not set!");
    process.exit(1);
  }

  try {
    const { chromium } = require("playwright");
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    });
    const page = await context.newPage();

    // URL with size filter pre-applied
    const url = `https://www.willhaben.at/iad/immobilien/eigentumswohnung/steiermark/graz/?ESTATE_SIZE%2FFROM=${CONFIG.MIN_SIZE}&ESTATE_SIZE%2FTO=${CONFIG.MAX_SIZE}`;

    log(`Navigating to Graz Eigentumswohnungen (${CONFIG.MIN_SIZE}-${CONFIG.MAX_SIZE}m²)...`);

    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    } catch (e) {
      if (e.message.includes("Timeout")) {
        log(`Page load timeout (OK), continuing...`);
      } else {
        throw e;
      }
    }

    // Wait for JS rendering
    await page.waitForTimeout(5000);

    // Extract listings using data-testid pattern
    const listings = await page.evaluate(() => {
      const items = [];
      const seen = new Set();

      // Find all listing links (new URL format: /iad/immobilien/d/...)
      const links = document.querySelectorAll('a[href*="/iad/immobilien/d/"]');

      links.forEach((link) => {
        try {
          const href = link.getAttribute("href");
          if (!href) return;

          // Extract ID from end of URL slug (e.g., "-1234567890/")
          const idMatch = href.match(/-(\d{8,12})\/?$/);
          if (!idMatch) return;

          const id = idMatch[1];
          if (seen.has(id)) return;
          seen.add(id);

          const priceEl = document.querySelector(
            `[data-testid="search-result-entry-price-${id}"]`
          );
          const attr0El = document.querySelector(
            `[data-testid="search-result-entry-teaser-attributes-${id}-0"]`
          );
          const attr1El = document.querySelector(
            `[data-testid="search-result-entry-teaser-attributes-${id}-1"]`
          );
          const titleEl = document.querySelector(
            `[data-testid="search-result-entry-header-${id}"]`
          );
          const subEl = document.querySelector(
            `[data-testid="search-result-entry-subheader-${id}"]`
          );

          // Only include listings where we can extract price data
          const priceText = priceEl ? priceEl.textContent.trim() : "";
          if (!priceText) return;

          items.push({
            id,
            href,
            title: titleEl ? titleEl.textContent.trim() : "",
            location: subEl ? subEl.textContent.trim() : "",
            price: priceText,
            size: attr0El ? attr0El.textContent.trim() : "",
            rooms: attr1El ? attr1El.textContent.trim() : "",
          });
        } catch (_) {
          // Skip broken elements
        }
      });

      return items;
    });

    log(`Found ${listings.length} listings on page`);

    let cache = loadCache();
    let newListings = 0;
    let filteredOut = 0;

    for (const listing of listings) {
      if (cache[listing.id]) {
        continue; // Already seen
      }

      const price = parsePrice(listing.price);
      const size = parseSize(listing.size);

      if (price === 0 || size === 0) {
        log(`SKIP ${listing.id}: could not parse price="${listing.price}" size="${listing.size}"`);
        // Cache it anyway to avoid re-processing
        cache[listing.id] = { skipped: true, timestamp: Date.now() };
        continue;
      }

      const pricePerM2 = Math.round(price / size);

      // Apply price-per-m² filter
      if (pricePerM2 > CONFIG.MAX_PRICE_PER_M2) {
        filteredOut++;
        // Cache it so we don't re-check
        cache[listing.id] = {
          title: listing.title,
          price,
          size,
          pricePerM2,
          filtered: true,
          timestamp: Date.now(),
        };
        continue;
      }

      // 🎉 New listing within criteria!
      newListings++;
      const fullUrl = `https://www.willhaben.at${listing.href}`;
      const title = listing.title || `Wohnung ${listing.id}`;

      const message =
        `🏠 <b>Neue Immobilie gefunden!</b>\n\n` +
        `<b>${title}</b>\n` +
        `📍 ${listing.location}\n` +
        `📐 ${listing.size} | ${listing.rooms}\n` +
        `💰 ${price.toLocaleString("de-AT")} € (<b>${pricePerM2} €/m²</b>)\n` +
        `\n<a href="${fullUrl}">🔗 Ansehen auf Willhaben</a>`;

      try {
        await sendTelegram(message);
        log(`NOTIFIED: ${listing.id} - ${title} (${pricePerM2}€/m²)`);
      } catch (err) {
        log(`WARNING: Could not send Telegram: ${err.message}`);
      }

      cache[listing.id] = {
        title,
        price,
        size,
        pricePerM2,
        location: listing.location,
        timestamp: Date.now(),
      };

      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    saveCache(cache);
    log(
      `Monitor completed. New: ${newListings}, Filtered out (>${CONFIG.MAX_PRICE_PER_M2}€/m²): ${filteredOut}. Total cached: ${Object.keys(cache).length}`
    );

    await browser.close();
    process.exit(0);
  } catch (error) {
    log(`ERROR: ${error.message}\n${error.stack}`);
    process.exit(1);
  }
}

run();
