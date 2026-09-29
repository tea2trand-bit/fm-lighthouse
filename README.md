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
ausgeliefert, damit `<img>`- und Download-Links funktionieren.

## Entwicklung

```sh
npm ci
npm run typecheck
npm test
```

`npm test` führt die Unit-Tests immer aus. Die API-Tests in `tests/api.test.mjs` laufen nur mit
`TEST_DATABASE_URL`, einer Postgres-Testdatenbank mit allen Migrationen. **Die Tests leeren alle
`fm360_*`-Tabellen, also nie auf echte Daten zeigen lassen.** Lokal öffnet der Postgres-Treiber viele
Verbindungen, daher Postgres mit `max_connections=500` starten.
