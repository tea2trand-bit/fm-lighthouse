# FM360 Project Instructions

## Wichtige Architektur-Regel für den Dokumentenpool

Der Dokumentenpool darf keine eigene, separate Ordnerstruktur erzeugen.

Es sollen keine neuen Ordner, Standorte, Gebäude, Etagen oder Räume manuell im Dokumentenpool angelegt werden.

Stattdessen muss der Dokumentenpool automatisch die bereits existierende FM-Struktur übernehmen, die im System unter Struktur / Einträge vorhanden ist.

Das bedeutet:

Wenn bereits folgende Struktur existiert:
- Standort: Haslen
  - Objekt / Gebäude: Neubau
    - Etage: UG
      - Raum: Heizraum
        - Anlage: Kompressor 1

Dann muss exakt dieselbe Struktur automatisch im Dokumentenpool sichtbar sein:
`Dokumentenpool → Haslen → Neubau → UG → Heizraum → Kompressor 1`

Der Dokumentenpool ist somit nur eine alternative Navigationsansicht auf dieselben bestehenden Nodes.

### Technische Regel

Der Dokumentenpool soll:
- dieselben `fm360_nodes` verwenden
- keine separaten Dokumentenpool-Nodes speichern
- keine Duplikate erzeugen
- ausschließlich vorhandene Struktur-Einträge als Ordner darstellen

Nur Dokumente selbst werden zusätzlich angezeigt.

### Ziel

Der Benutzer baut die Struktur nur einmal im FM-Navigator.

Sobald neue Einträge erstellt werden (Standort, Gebäude, Etage, Raum, Anlage, Bauteil), erscheinen diese automatisch im Dokumentenpool — ohne zusätzliche Konfiguration.

### Zusätzliche Regeln für Dokumente & Ansichten

1. **Eindeutige Zuordnung (Single Parent Rule):**
   - Jedes Dokument darf nur exakt einem übergeordneten Knoten (Parent Node) direkt zugeordnet sein.
   - Ein Dokument gehört z. B. direkt zu "Kompressor 1" — nicht gleichzeitig zu "Heizraum", "Kompressor" und dem Root-Verzeichnis des Dokumentenpools.
   - Falls ein Dokument an mehreren Stellen referenziert werden soll, muss dies über Tags, Labels oder virtuelle Referenzen gelöst werden, nicht durch Duplizierung.

2. **Zwei Ansichts- und Filtermodi (Dual Mode):**
   - **Tree-Modus (Explorer-Ansicht):** Klassische Navigation über die hierarchische FM-Struktur (`Standort` → `Gebäude` → `Etage` → `Raum` → `Anlage`).
   - **Flat-Search-Modus (Globale Suche):** Ein flacher Filter- und Suchmodus über alle Dokumente hinweg (z. B. zur direkten Suche nach bestimmten Dateitypen wie PDFs, abgelaufenen Zertifikaten, Betriebsanleitungen oder allen Dokumenten zum Thema "Brandschutz" über das gesamte System), ohne tief in die Baumstruktur navigieren zu müssen.

---

**In einem Satz:**
`Dokumentenpool = Spiegel / Explorer der bestehenden Struktur, nicht neue Struktur.` (1:1 Abbildung der bestehenden FM-Struktur)
