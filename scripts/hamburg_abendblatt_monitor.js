#!/usr/bin/env node

/**
 * Hamburger Abendblatt - Christina Block Entführungsprozess Monitor
 * Nutzt DuckDuckGo-Suche statt direktes HTML-Scraping
 */

const https = require('https');
const fs = require('fs');

const STATE_FILE = '/Users/macmini/.openclaw/workspace/.abendblatt_state.json';

function fetchUrl(url, options = {}) {
  return new Promise((resolve, reject) => {
    const timeout = options.timeout || 8000;
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'de-DE,de;q=0.9',
        ...options.headers
      }
    }, (res) => {
      // Handle redirects
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchUrl(res.headers.location, options).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });

    req.setTimeout(timeout, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.on('error', reject);
  });
}

function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    }
  } catch (err) {
    console.log('[WARN] State file nicht lesbar:', err.message);
  }
  return { seenUrls: [], lastRun: null };
}

function saveState(state) {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch (err) {
    console.log('[WARN] State file nicht schreibbar:', err.message);
  }
}

async function searchAbendblattArticles() {
  const results = [];

  // Methode 1: DuckDuckGo HTML-Suche
  try {
    console.log('[INFO] Suche via DuckDuckGo...');
    const searchUrl = 'https://html.duckduckgo.com/html/?q=site%3Aabendblatt.de+%22Christina+Block%22&kl=de-de';
    const { status, body } = await fetchUrl(searchUrl);

    console.log(`[INFO] DuckDuckGo Status: ${status}`);

    // DuckDuckGo HTML-Ergebnisse parsen
    const resultBlocks = body.match(/<a[^>]+class="result__a"[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/gi) || [];
    console.log(`[INFO] Gefundene Links: ${resultBlocks.length}`);

    resultBlocks.forEach(block => {
      const hrefMatch = block.match(/href="([^"]+)"/);
      const titleMatch = block.match(/>([^<]+)<\/a>/);
      if (hrefMatch && titleMatch) {
        let url = hrefMatch[1];
        // DuckDuckGo redirect URLs auflösen
        if (url.includes('uddg=')) {
          try {
            url = decodeURIComponent(url.split('uddg=')[1].split('&')[0]);
          } catch (e) { /* ignore */ }
        }
        if (url.includes('abendblatt.de')) {
          results.push({
            title: titleMatch[1].trim(),
            url: url
          });
        }
      }
    });
  } catch (err) {
    console.log('[WARN] DuckDuckGo Suche fehlgeschlagen:', err.message);
  }

  // Methode 2: Abendblatt RSS Feed (falls vorhanden)
  if (results.length === 0) {
    try {
      console.log('[INFO] Versuche Abendblatt RSS...');
      const rssUrl = 'https://www.abendblatt.de/rss';
      const { status, body } = await fetchUrl(rssUrl);
      console.log(`[INFO] RSS Status: ${status}`);

      // RSS Items mit Christina Block oder Block-Prozess
      const items = body.match(/<item>[\s\S]*?<\/item>/gi) || [];
      console.log(`[INFO] RSS Items: ${items.length}`);

      items.forEach(item => {
        const titleMatch = item.match(/<title><!\[CDATA\[([^\]]+)\]\]><\/title>/) || item.match(/<title>([^<]+)<\/title>/);
        const linkMatch = item.match(/<link>([^<]+)<\/link>/) || item.match(/<guid[^>]*>([^<]+)<\/guid>/);

        if (titleMatch && linkMatch) {
          const title = titleMatch[1];
          const url = linkMatch[1].trim();
          if (title.toLowerCase().includes('block') || title.toLowerCase().includes('entführ')) {
            results.push({ title, url });
          }
        }
      });
    } catch (err) {
      console.log('[WARN] RSS Fetch fehlgeschlagen:', err.message);
    }
  }

  // Methode 3: Abendblatt direkte Stichwort-Suche
  if (results.length === 0) {
    try {
      console.log('[INFO] Versuche Abendblatt Suche direkt...');
      const url = 'https://www.abendblatt.de/suche/?q=Christina+Block+Prozess';
      const { status, body } = await fetchUrl(url);
      console.log(`[INFO] Abendblatt Suche Status: ${status}, Body-Länge: ${body.length}`);

      // Suche nach JSON-LD oder og:url Metadaten
      const jsonLdMatches = body.match(/"url"\s*:\s*"(https:\/\/www\.abendblatt\.de\/[^"]+)"/g) || [];
      jsonLdMatches.forEach(m => {
        const urlMatch = m.match(/"url"\s*:\s*"([^"]+)"/);
        if (urlMatch && urlMatch[1].includes('article')) {
          results.push({ title: 'Artikel', url: urlMatch[1] });
        }
      });
    } catch (err) {
      console.log('[WARN] Abendblatt direkte Suche fehlgeschlagen:', err.message);
    }
  }

  return results;
}

async function main() {
  console.log('[INFO] Starte Hamburger Abendblatt Monitor (v2)...');
  const state = loadState();
  console.log(`[INFO] Bekannte URLs: ${state.seenUrls.length}`);

  const articles = await searchAbendblattArticles();
  console.log(`[INFO] Gefundene Artikel insgesamt: ${articles.length}`);

  if (articles.length === 0) {
    console.log('[INFO] Keine Artikel gefunden — Suchmethoden haben keine Ergebnisse geliefert.');
    console.log('[RESULT] NO_ARTICLES');
    return;
  }

  // Duplikate entfernen
  const unique = articles.filter((a, i, arr) => arr.findIndex(b => b.url === a.url) === i);

  // Neue Artikel filtern
  const newArticles = unique.filter(a => !state.seenUrls.includes(a.url));
  console.log(`[INFO] Neue Artikel: ${newArticles.length}`);

  if (newArticles.length === 0) {
    console.log('[INFO] Keine neuen Artikel seit letztem Check.');
    console.log('[RESULT] NO_NEW_ARTICLES');
    return;
  }

  // Ausgabe für den Cron-Agent
  console.log(`[RESULT] NEW_ARTICLES_FOUND: ${newArticles.length}`);
  newArticles.forEach((a, i) => {
    console.log(`[ARTICLE_${i+1}] TITLE: ${a.title}`);
    console.log(`[ARTICLE_${i+1}] URL: ${a.url}`);
  });

  // State updaten
  state.seenUrls = Array.from(
    new Set([...state.seenUrls, ...unique.map(a => a.url)])
  ).slice(-200);
  state.lastRun = new Date().toISOString();
  saveState(state);
}

main().catch(err => {
  console.error('[ERROR]', err.message);
  process.exit(1);
});
