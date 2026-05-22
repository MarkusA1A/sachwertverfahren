# MEMORY.md - Long-Term Memory

## Quellen & Dateien

### Berkshire Hathaway Shareholder Meetings
- Datei: `memory/berkshire-shareholder-meetings.txt`
- Hochgeladen von Markus am 2026-05-21
- **Anweisung:** Bei Fragen zu Buffett & Munger diese Datei IMMER als Primärquelle einbeziehen, zusätzlich zu allgemeinem Trainingswissen und Web-Suche

### Berkshire Hathaway Shareholder Letters (offiziell)
- URL: https://www.berkshirehathaway.com/letters/letters.html
- Lokales Archiv (Text extrahiert): `memory/berkshire-letters-archive.json` (1977–2024, 48 Jahrgänge, ~3,5 Mio. Zeichen)
- PDFs gespeichert in: `memory/berkshire-letters/`
- **Anweisung:** Bei Fragen zu Buffett & Munger IMMER das lokale Archiv vollständig durchsuchen (alle Jahrgänge, nicht nur einzelne). Python-Suche mit re.finditer(über alle Jahre im JSON). Archiv bei Bedarf durch neue Jahrgänge ergänzen.

## Buffett & Munger Investmentfragen

**WICHTIG:** Bei jeder Frage zu Buffett/Munger IMMER folgende Quellen verwenden:

1. **Berkshire Letters Archive** (`memory/berkshire-letters-archive.json`) — alle Jahrgänge
2. **Shareholder Meetings** (`memory/berkshire-shareholder-meetings.txt`) — wörtliche Zitate
3. **Aktuelle Marktdaten** — nicht älter als 2-3 Monate

→ **Siehe:** `memory/buffett-munger-research-protocol.md` für Details

**Grund:** Nike-Analyse vom 21.05.2026 zeigte unvollständige Quellennutzung.

## Präferenzen

### Telegram Formatierung
- Keine Markdown-Tabellen, keine ## Überschriften
- **Bold** für Abschnitte, Bullet-Listen statt Tabellen
- Sauber, kompakt, gut lesbar
- Gilt für alle Antworten auf Telegram
