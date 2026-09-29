# FM Lighthouse 360°

Facility-Management-App für FUST Oberbüren: Struktur (Standort → Gebäude → Etage → Raum → Anlage),
Tickets, Piketdienst, Mitarbeiterplanung, Brandschutz, Sicherheit, Dokumentenpool, Budget und Projekte.

| Teil | Datei |
|---|---|
| Desktop-/Admin-App | `index.html` |
| Mitarbeiter-App (mobil, QR-Codes) | `field.html` |
| API `/api/fm360` | `netlify/functions/fm360.ts` |
| Passwort-Hashing | `server/password.ts` |
| Datenbankschema (Drizzle) | `db/schema.ts`, Migrationen in `netlify/database/migrations/` |

Läuft auf Netlify mit Netlify Database (Postgres) und Netlify Blobs (Fotos, Dokumente).

## Konfiguration

`FM360_AUTH_SECRET` muss in Netlify als Umgebungsvariable gesetzt sein (lange Zufallszeichenkette).
Damit werden die Login-Tokens signiert; ohne sie ist kein Login möglich (ausser auf `localhost`).

## Logins

Auf einer leeren Datenbank werden die Standard-Logins `admin`/`admin` und `worker`/`worker` angelegt,
damit man sich überhaupt anmelden kann. Sobald ein Login funktioniert, werden sie nicht mehr angefasst.
Nach der Einrichtung unter *System / Administration* das Admin-Passwort ändern und `worker` deaktivieren
oder mit eigenem Passwort versehen.

Alle API-Aufrufe brauchen einen Login. Fotos und Dokumente werden über ein HttpOnly-Session-Cookie
ausgeliefert, damit `<img>`- und Download-Links funktionieren. Nur PDF, Bilder und Text werden im
Browser angezeigt, alle anderen Dateien werden heruntergeladen.

Nach 10 falschen Passwörtern für einen Loginnamen (oder 50 von einer IP-Adresse) wird die Anmeldung
für 15 Minuten gesperrt.

## Berechtigungen

Die Rolle eines Mitarbeiters (Feld *Rolle*) bestimmt, was er ändern darf. Der Server prüft das bei
jeder Anfrage.

| Rolle | Darf |
|---|---|
| Admin / Chef | alles |
| FM Internal | alles ausser Logins, Passwörter, Rollen und Berechtigungen |
| Field Technician, External, Piket Only | Tickets, Fotos, Aufgaben und Benachrichtigungen erfassen und ändern (was die Mitarbeiter-App braucht), nichts löschen |

Lesen dürfen alle angemeldeten Mitarbeiter. Der letzte aktive Admin-Login kann nicht deaktiviert,
herabgestuft oder gelöscht werden; das Standard-Konto `emp-admin` behält immer Admin-Rechte.

## Speichern

Die Desktop-App schickt beim Speichern nur die geänderten, neuen und gelöschten Datensätze
(`PATCH` mit `action: "batch"`), die der Server in einer Transaktion übernimmt. Wer gleichzeitig
arbeitet, überschreibt sich dadurch nicht mehr gegenseitig.

## Entwicklung

```sh
npm ci
npm run typecheck
npm test
```

`npm test` führt immer die Unit-Tests und die Prüfung aus, dass Werte in den HTML-Vorlagen von
`index.html` und `field.html` mit `esc()` maskiert werden (Schutz gegen eingeschleustes HTML/JavaScript). Die API-Tests in `tests/api.test.mjs` laufen nur mit
`TEST_DATABASE_URL`, einer Postgres-Testdatenbank mit allen Migrationen. **Die Tests leeren alle
`fm360_*`-Tabellen, also nie auf echte Daten zeigen lassen.** Lokal öffnet der Postgres-Treiber viele
Verbindungen, daher Postgres mit `max_connections=500` starten.
