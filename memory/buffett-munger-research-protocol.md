# Buffett & Munger Research Protocol

**Datum hinzugefügt:** 2026-05-21  
**Grund:** Nike-Analyse Fehler - unvollständige Quellen-Verwendung

## Anforderung

Für **JEDE Frage zu Buffett und/oder Munger** (Investment-Analysen, Kriterien, Philosophie, etc.):

### ✅ Quellen-Checkliste

1. **Berkshire Letters Archive** (`memory/berkshire-letters-archive.json`)
   - Alle verfügbaren Jahrgänge durchsuchen
   - Relevante Konzepte: Moats, wonderful businesses, DCF, circle of competence
   - Langjährige Trends in Aussagen

2. **Shareholder Meetings Zusammenfassung** (`memory/berkshire-shareholder-meetings.txt`)
   - Wörtliche Zitate von Buffett & Munger
   - Philosophische Aussagen zu Investing-Kriterien
   - Q&A-Antworten zu spezifischen Situationen
   - **IMMER miteinbeziehen** - nicht als "optional" behandeln

3. **Aktuelle Marktdaten**
   - Web-Suche für aktuelle Fundamentals (Jahre, Preise, Growth-Raten)
   - Nicht älter als 2-3 Monate rechnen

### 🔍 Analyse-Template

Für jede Buffett/Munger-Frage dokumentieren:

```
QUELLEN GECHECKT:
□ Shareholder Letters Archive (Zeitraum: ___)
□ Shareholder Meetings (Relevante Konzepte: ___)
□ Aktuelle Marktdaten (Stand: ___)

RELEVANTE BUFFETT/MUNGER ZITATE:
- [Zitat 1 mit Quelle]
- [Zitat 2 mit Quelle]

ANALYSE BASIEREND AUF:
[Wie verbinde ich alle drei Quellen?]

FAZIT:
[Was sagen Buffett & Munger zusammenfassend dazu]
```

### ⚠️ Häufige Fehler (vermeiden!)

1. ❌ Nur Letters Archive verwenden, Shareholder Meetings ignorieren
2. ❌ Alte Daten rechnen (2024er Preise in 2026) → IMMER aktuelles Jahr checken
3. ❌ "Ich kann keine Zitate finden" → Dann deutlicher sagen, dass die Quelle nicht genug enthält
4. ❌ Allgemein-Wissen verwenden statt den lokalen Archiven zu trauen

### 📝 Dokumentation im Response

Bei jeder Buffett/Munger-Analyse einen Block hinzufügen:

```
**Quellen für diese Analyse:**
- Berkshire Letters: [Jahrgänge, Konzepte]
- Shareholder Meetings: [Relevante Aussagen]
- Marktdaten: [Stand, Quellen]
```

## Nike-Fall (was ich hätte besser machen sollen)

❌ **Fehler 1:** Nur 2024er Daten verwendet (shareholder-meetings nicht konsultiert)  
✅ **Hätte tun sollen:** Web-Search für 2026 Q3 Ergebnisse + Meetings durchsuchen nach "Turnaround", "deteriorating", "China risk"

❌ **Fehler 2:** Keine Warnung gegeben, dass "2024 Daten" verwendet werden  
✅ **Hätte tun sollen:** Explizit sagen "Daten sind aus FY24, bitte mit aktuellen Zahlen gegenchecken"

❌ **Fehler 3:** Shareholder Meetings gar nicht konsultiert  
✅ **Hätte tun sollen:** Nach Buffett-Aussagen zu "Turnarounds", "declining margins", "fashion/consumer" suchen

## Going Forward

Ab sofort: **Nike-Typ Fragen = IMMER beide Archive + aktuelle Daten**
