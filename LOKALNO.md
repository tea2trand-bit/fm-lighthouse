# FM Lighthouse — lokalno okruženje

Pripremljeno 29.09.2026; objedinjene izmene proverene 30.09.2026.

- GitHub: https://github.com/tea2trand-bit/fm-lighthouse
- Grana: `main`, prati `origin/main`.
- Osnova iz GitHub-a: `b1e3acd41f5cfb77de300d5f8a16cd8f04a2b22c` (PR #16), uz lokalno objedinjene izmene navedene ispod.
- Netlify projekat: `fm-lighthouse360-git`.
- Objavljena aplikacija: https://fm-lighthouse360-git.netlify.app
- Lokalni Netlify link: `.netlify/state.json`.

## Pokretanje

U PowerShell terminalu otvorenom u ovom folderu:

```powershell
.\fm-local.ps1 start
```

- Desktop aplikacija: http://localhost:8890/
- Mobilna aplikacija: http://localhost:8890/field.html
- Zaustavljanje: `Ctrl+C` u terminalu u kome je server pokrenut.
- Drugi port po potrebi: `.\fm-local.ps1 start -Port 8891`.

Početni nalozi **u lokalnoj razvojnoj bazi** su `admin` / `admin` i
`worker` / `worker`. Lokalna baza je nova, pa su brojači objekata i tiketa
na početku nula. Produkcioni podaci nisu kopirani.

Server koristi `netlify dev --offline`, lokalnu bazu i lokalni prostor za
datoteke. Podaci ostaju u `.netlify/`, a baza u `.netlify/db/`. Skripta
uklanja eventualno nasleđeni `NETLIFY_DB_URL` samo tokom svog izvršavanja.
Lokalni testovi ne koriste produkcionu bazu. Objava ide preko postojeće GitHub grane `main` i povezanog Netlify projekta.

## Provere

```powershell
.\fm-local.ps1 check
.\fm-local.ps1 test-api
```

`check` pokreće TypeScript proveru i 38 testova koji ne koriste bazu.
`test-api` za svaki poziv pravi novu bazu u memoriji, primenjuje postojeće
migracije i pokreće 33 API testa. Ta baza se gasi po završetku; razvojna
i produkciona baza se ne koriste za testove.

Postojeći API testovi brišu sve `fm360_*` tabele u svojoj testnoj bazi.
Za njih koristiti pripremljenu komandu `test-api`, koja sama bira izolovanu bazu.

Rezultat pripreme:

- TypeScript: uspešno.
- Testovi bez baze: 38/38 uspešno.
- API testovi: 33/33 uspešno.
- Migracije: svih 26 uspešno primenjeno i u razvojnoj i u privremenoj testnoj bazi.
- JavaScript unutar oba HTML fajla: uspešna sintaksna provera.
- Desktop prijava i obnova sesije posle učitavanja: uspešno u pregledaču.
- Produkcionu objavu potvrditi statusom `ready` i odgovarajućim Git commitom u Netlify-ju.

Tokom automatizovanog unosa u lokalnu prijavu konzola je zabeležila
`c.nodeName.toLowerCase is not a function`. Prijava i učitavanje podataka
su završeni sa HTTP 200, a pri ponovnom učitavanju nije zabeležena nova
poruka. Poreklo te poruke nije potvrđeno.

Netlify CLI takođe prijavljuje da funkcija koristi legacy CommonJS format;
postojeća funkcija se ipak uspešno učitava i radi. Izvorni kod nije menjan
radi uklanjanja razvojnih upozorenja.

## Migracije pri budućem radu

Sve trenutne migracije su već primenjene. Posle dodavanja novih migracija,
dok razvojni server radi, u drugom terminalu pokrenuti:

```powershell
.\fm-local.ps1 migrate
.\fm-local.ps1 db-status
```

## Lokalni alati

Korišćeni su postojeći Node.js `24.19.0`, lokalni npm `12.1.0` i Netlify CLI
`27.10.2`. Skripta pronalazi Node.js preko `PATH` ili postojećeg Codex runtime-a.
Alati su u `.netlify/tools/`, a projektne zavisnosti u `node_modules/`.
Nije potrebna globalna instalacija Netlify CLI-ja.

Za ponovnu instalaciju projektnih zavisnosti na ovom računaru:

```powershell
node .netlify/tools/npm/bin/npm-cli.js ci --cache .netlify/npm-cache --no-fund --no-audit
```

Za ponovnu instalaciju lokalnog Netlify CLI-ja:

```powershell
node .netlify/tools/npm/bin/npm-cli.js install --prefix .netlify/tools/runtime --cache .netlify/npm-cache --no-fund --no-audit netlify-cli@27.10.2
```

`fm-local.ps1` i ovo uputstvo su pomoć za lokalni razvoj. `.netlify/` i `node_modules/` već su ignorisani
u Git-u. API test runner je u `.netlify/run-api-tests.mjs` i pripada ovom
lokalnom okruženju.

Dokumentacija: https://docs.netlify.com/build/data-and-storage/netlify-database/local-development/

## Funkcije u ovoj izmeni

- Arbeitsauftrag je jednokratan posao. Kontrollticket / Inspektion je odvojena vrsta, kreira se dugmetom na Anlage i ima interval u danima, nedeljama ili mesecima.
- Nedeljni/mesečni kalendar prikazuje kratke naslove, najviše tri po ćeliji i dugme za ostale. Klik otvara detalje, Materialbedarf i štampu/PDF.
- Kada radnik završi kontrolu, rezultat ostaje u istoriji, a sledeći termin nastaje tačno jednom. Novi termin zadržava kontrolne tačke, ne prepisuje prethodni rezultat.
- Podsetnik ide šefu kroz zvonce i pregled u aplikaciji. Provera podsetnika radi pri učitavanju/obnavljanju podataka i otvaranju zvonca; nema e-pošte ili spoljnog push servisa.
- Telefon prikazuje direktno dodeljene naloge/kontrole, podatke o mestu i materijalu, i unos rezultata. Admin ima vezu ka desktop planiranju i na tabletu.
- Piket-kalendar koristi punu širinu; planiranje se otvara dugmetom. Velika traka aktuelnog dežurstva je uklonjena.
- Dokumentenpool koristi postojeću FM hijerarhiju, pretragu i filtere. Povratak iz dodavanja dokumenta čuva otvorenu Anlage, njenu karticu i nesačuvana polja.
- Novi prostor prikazuje QR tek posle uspešnog čuvanja. Lokalni localhost QR nije adresa dostupna sa drugog uređaja; za upotrebu u zgradi koristiti objavljenu aplikaciju.

Pregled na portu 8891 koristi samo privremene primere, odvojene od lokalne i produkcione baze. Primeri se ne objavljuju.

## Jednostavnije planiranje, 30.09.2026

- Arbeitsplan prikazuje sve radnike; donji blok filtera je uklonjen. Odmor i bolest vide se u kalendaru. Prazni redovi su oko 24% niži.
- Ispod kalendara je lista „Kontrollen einplanen“. Prikazuje otvorene kontrole koje još nemaju raspored, najviše pet odmah, uz otvaranje ostalih.
- „Einplanen“ traži radnika i dan. Čuva postojeći taskAssignment; rok kontrole i interval se ne menjaju. Naknadna promena plana ažurira isti unos.
- Po završetku sledeća kontrola dolazi na listu za raspoređivanje; prethodni rezultat ostaje u istoriji. Telefon koristi planirani dan i trenutnu dodelu.
- Novi nalog/kontrola nema Servicefirma & Abrechnung; taj odeljak ostaje u uređivanju postojećeg naloga. Materialbedarf se unosi tek po otvaranju posebnog dugmeta. Prazan odeljak materijala se ne prikazuje u detaljima.
- Provereno u privremenoj bazi: planiranje 30.09. za rok 10.10, prikaz kod radnika, završetak kontrole i novi neraspoređeni rok 22.10. Produkcioni podaci nisu korišćeni za probe.
