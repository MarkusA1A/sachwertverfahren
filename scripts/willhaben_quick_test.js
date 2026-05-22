#!/usr/bin/env node

const { chromium } = require("playwright");

(async () => {
  console.log("[TEST] Quick connectivity test...\n");
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    console.log("1️⃣ Loading Willhaben.at...");
    await page.goto("https://www.willhaben.at/iad/immobilien/eigentumswohnung/eigentumswohnung-angebote", {
      waitUntil: "networkidle",
      timeout: 60000,
    });

    console.log("2️⃣ Checking page title...");
    const title = await page.title();
    console.log(`   Title: "${title}"`);

    console.log("3️⃣ Looking for listings...");
    const count = await page.evaluate(() => {
      return document.querySelectorAll("a[href*='/immobilien/d/']").length;
    });
    console.log(`   Found ${count} property links`);

    if (count > 0) {
      console.log("4️⃣ Extracting first listing...");
      const sample = await page.evaluate(() => {
        const link = document.querySelector("a[href*='/immobilien/d/']");
        if (!link) return null;
        const parent = link.closest("article") || link.parentElement;
        return {
          title: parent?.textContent?.slice(0, 100) || "Unknown",
          url: link.href,
        };
      });
      if (sample) {
        console.log(`   Title: ${sample.title}`);
        console.log(`   URL: ${sample.url}`);
      }
    }

    console.log("\n✅ TEST PASSED: Willhaben.at is reachable and scriptable");
    console.log("ℹ️  Production job will have better resources & longer timeouts");
  } catch (err) {
    console.error("\n❌ TEST FAILED:", err.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
