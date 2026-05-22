#!/usr/bin/env node

/**
 * Willhaben.at Test - Playwright mit robustem Selector
 */

async function testWillhaben() {
  console.log(
    "[TEST] Starting Willhaben.at Playwright test (adaptive selectors)..."
  );

  try {
    const { chromium } = require("playwright");

    console.log("[TEST] Launching Chromium...");
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    page.setDefaultTimeout(45000);

    console.log("[TEST] Navigating to Willhaben.at...");
    const url =
      "https://www.willhaben.at/iad/immobilien/eigentumswohnung/eigentumswohnung-angebote";

    await page.goto(url, { waitUntil: "domcontentloaded" });
    console.log("[TEST] ✅ Page loaded (DOM ready)");

    // Wait for some content
    await page.waitForTimeout(5000);

    // Try to find listings with multiple selector strategies
    const listings = await page.evaluate(() => {
      const items = [];

      // Strategy 1: Links mit bestimmten Klassen
      const linkSelectors = [
        "a[href*='/iad/immobilien/d/']", // Direct property links
        "a[href*='/immobilien/']", // Any immobilien link
        "article a", // Article links
      ];

      let foundLinks = [];
      for (const selector of linkSelectors) {
        const links = Array.from(document.querySelectorAll(selector));
        if (links.length > 0) {
          foundLinks = links;
          console.log(`Found ${links.length} links with selector: ${selector}`);
          break;
        }
      }

      foundLinks.slice(0, 5).forEach((link) => {
        try {
          const article = link.closest("article") || link.parentElement;
          if (!article) return;

          const titleEl =
            article.querySelector("h2") ||
            article.querySelector("h3") ||
            article.querySelector("a > div > div");
          const priceEl = article.querySelector(
            "[class*='price'], [class*='Price'], .price"
          );

          if (!titleEl) return;

          const title = titleEl.textContent.trim().slice(0, 60);
          const priceText = priceEl
            ? priceEl.textContent.replace(/[^\d]/g, "")
            : "0";
          const price = parseInt(priceText, 10);
          const url = link.getAttribute("href") || "#";

          if (price > 0) {
            items.push({
              title: title || "(no title)",
              price,
              url,
            });
          }
        } catch (e) {
          // Skip broken elements
        }
      });

      return {
        itemCount: items.length,
        items: items,
        pageTitle: document.title,
      };
    });

    console.log(`[TEST] ✅ Page title: "${listings.pageTitle}"`);
    console.log(`[TEST] ✅ Found ${listings.itemCount} listings`);

    if (listings.items.length > 0) {
      console.log("[TEST] Sample listings:");
      listings.items.forEach((item, i) => {
        console.log(`  ${i + 1}. ${item.title}`);
        console.log(`     💰 ${item.price}€`);
      });
    }

    const pageContent = await page.content();
    const hasListings = pageContent.includes("eigentumswohnung");

    if (hasListings && listings.itemCount > 0) {
      console.log("\n[TEST] ✅ SUCCESS: Listings found & page structure OK");
    } else if (hasListings) {
      console.log("\n[TEST] ⚠️  Page loaded but selector needs update");
      console.log("[TEST] Page content includes 'eigentumswohnung'");
    } else {
      console.log("\n[TEST] ⚠️  Could not verify page content");
    }

    await browser.close();
    process.exit(0);
  } catch (error) {
    console.error("[TEST] ❌ Error:", error.message);
    process.exit(1);
  }
}

testWillhaben();
