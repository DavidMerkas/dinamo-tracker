# Kako sam izgradio Dinamo Zagreb Handball Tracker

> **Cilj ovog vodiča:** Razumjeti svaki redak koda koji čini ovu aplikaciju — od baze podataka do dizajna. Nakon što pročitaš ovo, moći ćeš sam sagraditi ovakav projekt od nule.

---

## Sadržaj

1. [Što smo izgradili i kako to radi](#1-što-smo-izgradili-i-kako-to-radi)
2. [Tehnologije — što je što i zašto](#2-tehnologije)
3. [Postavljanje okoline](#3-postavljanje-okoline)
4. [Struktura projekta](#4-struktura-projekta)
5. [Baza podataka — database.py](#5-baza-podataka)
6. [Scraper — dohvaćanje podataka](#6-scraper)
7. [Backend server — app.py](#7-backend-server)
8. [HTML — kostur stranice](#8-html)
9. [CSS — dizajn](#9-css)
10. [JavaScript — logika u browseru](#10-javascript)
11. [Kako sve to zajedno radi](#11-kako-sve-zajedno-radi)
12. [Deploy — stavljanje na internet](#12-deploy)
13. [Što sljedeće naučiti](#13-što-sljedeće-naučiti)

---

## 1. Što smo izgradili i kako to radi

### Ideja

Stranica koja prikazuje:
- Tablicu lige (standings) za RK Dinamo Zagreb
- Odigrane utakmice (rezultati)
- Nadolazeće utakmice (raspored)

...za 4 dobne kategorije: Seniori, U17, U15, U13.

### Veliki plan (arhitektura)

```
[Internet: sportinfocentar2.com]
           ↓
     [Python Scraper]        ← dohvaća podatke
           ↓
    [SQLite Baza podataka]   ← čuva podatke
           ↓
    [FastAPI Server]         ← daje podatke browseru
           ↓
    [HTML + CSS + JavaScript] ← prikazuje korisniku
```

Ovo se zove **Client-Server arhitektura**:
- **Server** (Python/FastAPI) — radi "u pozadini", čuva podatke, odgovara na upite
- **Client** (Browser) — prikazuje podatke korisniku

---

## 2. Tehnologije

### Python
Programski jezik kojim su napisani scraper, baza i server. Popularan, čitljiv, ima ogromnu zajednicu i puno gotovih biblioteka (paketa).

### FastAPI
**Web framework** za Python. Framework = gotova struktura koja ti pomaže graditi web aplikacije. FastAPI ti omogućuje da napišeš API (sučelje za komunikaciju između servera i browsera) s minimalnim kodom.

```python
# Primjer — ovo je cijeli funkcionalni web server:
from fastapi import FastAPI
app = FastAPI()

@app.get("/pozdrav")
def pozdrav():
    return {"poruka": "Zdravo!"}
```

Kad browser posjeti `/pozdrav`, dobije: `{"poruka": "Zdravo!"}`

### SQLite + aiosqlite
**SQLite** je baza podataka u jednoj datoteci (`data.db`). Savršena za manje projekte — nema instalacije, radi odmah.

**aiosqlite** je Python paket koji omogućuje korištenje SQLite u async (asinkronom) kodu.

### httpx
Python paket za slanje HTTP zahtjeva (dohvaćanje web stranica/API-ja). Kao `requests`, ali podržava async.

### chompjs
Paket koji parsira JavaScript objekte kao JSON. Trebamo ga jer sportinfocentar2.com vraća podatke u JS formatu, ne čistom JSON-u.

### HTML/CSS/JavaScript
- **HTML** — struktura (što je na stranici)
- **CSS** — izgled (kako to izgleda)
- **JavaScript** — ponašanje (što se događa kada klikneš)

---

## 3. Postavljanje okoline

### Što je virtual environment?

Python projekti koriste **virtual environment** (venv) — izolirani prostor gdje instaliraš pakete samo za taj projekt. Tako projekti ne "zagađuju" jedan drugog.

```bash
# Kreiraj venv
python -m venv venv

# Aktiviraj (Windows)
venv\Scripts\activate

# Instaliraj pakete
pip install -r requirements.txt
```

### requirements.txt

Datoteka koja popisuje sve pakete potrebne za projekt:

```
fastapi==0.115.5      # web framework
uvicorn==0.32.1       # server koji pokreće FastAPI
httpx==0.27.2         # HTTP zahtjevi
chompjs==1.2.3        # parsiranje JS objekata
apscheduler==3.10.4   # zakazivanje zadataka (auto-refresh)
aiosqlite==0.20.0     # async SQLite
```

**Verzije su fiksirane** (npr. `==0.115.5`) da bi svaki developer imao iste verzije i da aplikacija radila isto na svim računalima.

---

## 4. Struktura projekta

```
rudar-tracker/
│
├── app.py              ← glavni server (FastAPI)
├── database.py         ← sve o bazi podataka
├── scraper.py          ← dohvaćanje podataka s interneta
├── refresh_scraper.py  ← skripta koja pokreće scraper
├── requirements.txt    ← popis paketa
├── render.yaml         ← konfiguracija za deploy
├── .gitignore          ← što Git ne treba pratiti
│
└── static/             ← datoteke koje browser direktno dobiva
    ├── index.html      ← HTML stranica
    ├── style.css       ← CSS dizajn
    ├── app.js          ← JavaScript logika
    └── dinamo-logo.png ← logo
```

**Zašto `static/` folder?**
FastAPI (i web serveri općenito) imaju poseban folder za "statične" datoteke — datoteke koje se šalju browseru nepromijenjene. HTML, CSS, JS i slike su statični; Python kod koji se izvodi nije.

---

## 5. Baza podataka

**Datoteka:** `database.py`

### Što je relacijska baza podataka?

Zamišljaj je kao Excel tablice koje su međusobno povezane. Naša baza ima 3 tablice:

```
competitions          standings              matches
─────────────         ─────────────────      ─────────────────────
natjecanje_id   ←──── natjecanje_id    ←──── natjecanje_id
name                  rank                   round
category              team                   date
last_updated          played                 home_team
                      won                    away_team
                      drawn                  home_score
                      lost                   away_score
                      goals_for              status
                      goals_against          venue
                      points
```

`natjecanje_id` je **strani ključ** (foreign key) — veza između tablica. Standings i matches znaju "kojoj" competition pripadaju.

### Kod objašnjen

```python
import aiosqlite        # async SQLite biblioteka
import os               # za rad s putanjama datoteka
from datetime import datetime  # za datume i vrijeme

# Putanja do baze — u istom folderu kao ovaj .py file
DB_PATH = os.path.join(os.path.dirname(__file__), "data.db")
```

`os.path.dirname(__file__)` vraća folder u kojem se nalazi `database.py`.
`os.path.join(...)` spaja elemente putanje (cross-platform — radi i na Windowsu i Linuxu).

```python
CREATE_TABLES = """
CREATE TABLE IF NOT EXISTS competitions (
    natjecanje_id INTEGER PRIMARY KEY,
    name          TEXT NOT NULL,
    category      TEXT NOT NULL,
    last_updated  TEXT
);
...
"""
```

**SQL** (Structured Query Language) je jezik za komunikaciju s bazom.
- `CREATE TABLE IF NOT EXISTS` — kreiraj tablicu, ali samo ako ne postoji
- `INTEGER PRIMARY KEY` — cijeli broj, jedinstven identifikator svake konkurencije
- `TEXT NOT NULL` — tekst koji mora biti unesena (ne smije biti prazan)

```python
COMPETITIONS_SEED = [
    (1677, "3. HRL Središte – M", "Seniori"),
    (1705, "1. HRL U17 – M",      "U17"),
    (1706, "1. HRL U15 – M",      "U15"),
    (1707, "1. HRL U13 – M",      "U13"),
]
```

"Seed" podaci — početni podaci koji se ubace pri prvom pokretanju. Ovi ID-evi su ID-evi natjecanja na sportinfocentar2.com.

```python
async def init_db():
    async with aiosqlite.connect(DB_PATH) as db:
        await db.executescript(CREATE_TABLES)
        for nat_id, name, category in COMPETITIONS_SEED:
            await db.execute(
                "INSERT OR IGNORE INTO competitions ...",
                (nat_id, name, category),
            )
        await db.commit()
```

**async/await** — Python može raditi više stvari "istovremeno". Kad čekaš da baza odgovori, Python može raditi nešto drugo. `async def` označava asinkronu funkciju, `await` govori "čekaj ovaj rezultat".

`INSERT OR IGNORE` — umetni zapis, ali ako već postoji (isti PRIMARY KEY), preskoči bez greške.

```python
async def save_competition_data(natjecanje_id: int, standings: list, matches: list):
    now = datetime.now().isoformat(timespec="seconds")
    async with aiosqlite.connect(DB_PATH) as db:
        # Briši stare podatke
        await db.execute("DELETE FROM standings WHERE natjecanje_id = ?", (natjecanje_id,))
        await db.execute("DELETE FROM matches   WHERE natjecanje_id = ?", (natjecanje_id,))

        # Unesi nove podatke
        for row in standings:
            await db.execute("INSERT INTO standings ...", (...))

        await db.commit()
```

Koristimo `?` umjesto direktnog umetanja vrijednosti u SQL string. Zašto?

**SQL Injection** — napad u kojemu zlonamjerni korisnik ubaci SQL kod u ulaz. Primjer:
```python
# LOŠE - ranjivo na napad:
await db.execute(f"INSERT INTO standings ... VALUES ({user_input})")
# Ako user_input = "0); DROP TABLE standings; --"
# Obrisat će se cijela tablica!

# DOBRO - parametrizirani upiti:
await db.execute("INSERT INTO standings ... VALUES (?)", (user_input,))
# SQLite automatski "sanitizira" ulaz
```

```python
async def get_all_data() -> list:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row  # redovi se ponašaju kao rječnici
        result = []

        async with db.execute("SELECT * FROM competitions ORDER BY natjecanje_id") as cur:
            competitions = await cur.fetchall()

        for comp in competitions:
            # Za svaku competition dohvati njen standings i matches
            ...
            result.append({
                "natjecanje_id": nat_id,
                "name": comp["name"],
                ...
            })

        return result
```

`db.row_factory = aiosqlite.Row` — bez ovoga, redovi iz baze su tuple (npr. `(1677, "Seniori", ...)`). S ovim možeš pisati `comp["name"]` umjesto `comp[1]` — puno čitljivije.

---

## 6. Scraper

**Datoteka:** `scraper.py`

### Što je scraper?

Program koji automatski dohvaća podatke s interneta. Mi dohvaćamo JavaScript datoteku s `sportinfocentar2.com` koja sadrži sve podatke o natjecanju.

URL format: `https://www.sportinfocentar2.com/coman/natjecanje1677.js`

### Struktura podataka koje dohvaćamo

JS datoteka izgleda otprilike ovako:
```javascript
var natjecanjeobjekt = {
    "broj": 1677,
    "naziv": "3.HRL Središte - Muški",
    "lige": [
        {
            "naziv": "Liga za Prvaka",
            "tablica": [
                {"por": 1, "n": "Dinamo Zagreb", "utk": 9, "pob": 8, ...},
                {"por": 2, "n": "Maksimir - Pastela 2", ...}
            ],
            "utakmice": [
                {"e1": "Dinamo Zagreb", "e2": "Sisak 2", "d": "2026-03-14", "r1": 36, "r2": 25, ...},
                ...
            ]
        }
    ]
}
```

Za natjecanja s više regionalnih skupina (U15, U13) postoji više elemenata u `"lige"` — trebamo naći onaj koji sadrži Dinamo Zagreb.

### Kodne skraćenice u podacima

| Ključ | Značenje |
|-------|----------|
| `por` | poredak (rank) |
| `n`   | naziv (team name) |
| `utk` | utakmice (played) |
| `pob` | pobjede (won) |
| `ner` | neriješeno (drawn) |
| `izg` | izgubljeno (lost) |
| `dat` | dati golovi (goals scored) |
| `prim`| primljeni golovi (goals conceded) |
| `bod` | bodovi (points) |
| `e1`  | ekipa 1 / domaćin (home team) |
| `e2`  | ekipa 2 / gost (away team) |
| `d`   | datum (date) |
| `r1`  | rezultat 1 / domaćin (home score) |
| `r2`  | rezultat 2 / gost (away score) |
| `kolo`| broj kola (round number) |
| `mnaziv`| naziv mjesta (venue name) |
| `mmjesto`| grad (venue city) |

### Kod objašnjen

```python
import re        # regularne ekspresije (za pretragu teksta)
import chompjs  # parsiranje JS objekata
import httpx    # HTTP zahtjevi

BASE_URL = "https://www.sportinfocentar2.com/coman/natjecanje{}.js"
CLUB_KEYWORDS = ["dinamo zagreb", "dinamo"]
```

`CLUB_KEYWORDS` — lista ključnih riječi po kojima prepoznajemo Dinamo. Koristimo listu jer bi u budućnosti mogli dodati više ključnih riječi.

```python
def _is_dinamo(name: str) -> bool:
    if not name:
        return False
    n = name.lower()  # pretvori u mala slova
    return any(k in n for k in CLUB_KEYWORDS)
```

`any(k in n for k in CLUB_KEYWORDS)` — generator expression. Prolazi kroz svaki keyword i provjerava je li unutar naziva. `any()` vraća True ako je ikoji uvjet ispunjen.

Ekvivalentno, ali dulje:
```python
for k in CLUB_KEYWORDS:
    if k in n:
        return True
return False
```

```python
def _fetch_js(natjecanje_id: int) -> dict:
    url = BASE_URL.format(natjecanje_id)
    r = httpx.get(url, headers=HEADERS, timeout=30, follow_redirects=True)
    r.raise_for_status()  # baci grešku ako status nije 200 OK

    text = r.text.strip()
    if text.startswith("var "):
        # Ukloni "var natjecanjeobjekt = " s početka
        text = re.sub(r"^var\s+\w+\s*=\s*", "", text).rstrip(";").strip()

    return chompjs.parse_js_object(text)
```

`re.sub(pattern, replacement, string)` — zamijeni sve što odgovara patternu s replacementom.

Pattern `r"^var\s+\w+\s*=\s*"` znači:
- `^` — na početku stringa
- `var` — bukvalno "var"
- `\s+` — jedan ili više razmaka
- `\w+` — jedna ili više slova/brojeva (naziv varijable)
- `\s*=\s*` — nula ili više razmaka, znak jednakosti, nula ili više razmaka

```python
def _find_dinamo_liga(data: dict) -> dict | None:
    for liga in data.get("lige", []):
        teams = [row.get("n", "") for row in liga.get("tablica", [])]
        if any(_is_dinamo(t) for t in teams):
            return liga
    return None
```

`data.get("lige", [])` — sigurno dohvaćanje iz rječnika. Ako ključ `"lige"` ne postoji, vrati `[]` umjesto greške.

List comprehension `[row.get("n", "") for row in liga.get("tablica", [])]` — kreira listu naziva timova iz standings podataka. Kraće od:
```python
teams = []
for row in liga.get("tablica", []):
    teams.append(row.get("n", ""))
```

```python
def _parse_standings(liga: dict) -> list:
    rows = []
    for row in liga.get("tablica", []):
        rows.append({
            "rank":          row.get("por"),
            "team":          row.get("n"),
            "played":        row.get("utk"),
            ...
        })
    return rows
```

Pretvaramo podatke iz sportinfocentar formata u naš format. Ovo se zove **mapping** ili **transformation**. Koristimo naše jasne nazive (`rank`, `team`, `played`) umjesto kratkih kodova (`por`, `n`, `utk`).

```python
def _parse_matches(liga: dict, group_teams: set) -> list:
    matches = []
    for m in liga.get("utakmice", []):
        home = m.get("e1") or ""
        away = m.get("e2") or ""

        # Zadrži samo utakmice unutar naše grupe
        if group_teams and (home not in group_teams or away not in group_teams):
            continue

        r1 = m.get("r1")
        r2 = m.get("r2")
        played = r1 is not None and r2 is not None
        ...
```

`continue` — preskoči ostatak petlje i prijeđi na sljedeći element.

`r1 is not None` — provjerava je li rezultat zabilježen. Ako `r1` ne postoji (utakmica još nije odigrana), API vraća `null` (u Pythonu: `None`).

```python
        # Sastavi lokaciju
        venue_name = (m.get("mnaziv") or "").strip()
        venue_city = (m.get("mmjesto") or "").strip()
        if venue_name and venue_city:
            venue = f"{venue_name}, {venue_city}"
        elif venue_name:
            venue = venue_name
        elif venue_city:
            venue = venue_city
        else:
            venue = None
```

`(m.get("mnaziv") or "")` — ako `mnaziv` ne postoji ili je `None`, koristi prazan string `""`.
`.strip()` — ukloni razmake s početka i kraja.

```python
async def scrape_all(competitions: list) -> dict:
    results = {}
    for comp in competitions:
        nat_id = comp["natjecanje_id"]
        try:
            data = scrape_competition(nat_id)
            results[nat_id] = data
        except Exception as exc:
            logger.error("Failed to scrape natjecanje=%s: %s", nat_id, exc)
            results[nat_id] = {"standings": [], "matches": []}
    return results
```

`try/except` — pokušaj izvršiti kod, ali ako se dogodi greška (Exception), izvrši kod u `except` bloku. Ovo sprječava pad cijelog programa ako jedno natjecanje ne može biti dohvaćeno.

---

## 7. Backend Server

**Datoteka:** `app.py`

### Što je web server?

Program koji "sluša" na određenom portu (npr. 8080) i odgovara na HTTP zahtjeve. Kad browser posjeti `http://localhost:8080/api/data`, server izvrši odgovarajuću funkciju i vrati rezultat.

### Kod objašnjen

```python
import asyncio      # asinkrono programiranje
import logging      # pisanje log poruka
import subprocess   # pokretanje vanjskih programa

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from database import get_all_data, init_db

app = FastAPI(title="Rudar Tracker")
```

`logging` — bolje od `print()` za server aplikacije. Možeš kontrolirati razinu (INFO, WARNING, ERROR), format i gdje se zapisuje (konzola, datoteka...).

```python
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s  %(message)s",
    datefmt="%H:%M:%S",
)
```

Ovo podešava format log poruka:
- `%(asctime)s` — trenutno vrijeme
- `%(levelname)-8s` — razina (INFO, WARNING...), poravnata na 8 znakova
- `%(name)s` — ime loggera
- `%(message)s` — sama poruka

```python
_refresh_lock = asyncio.Lock()

async def refresh_data():
    if _refresh_lock.locked():
        logger.info("Refresh already in progress, skipping.")
        return

    async with _refresh_lock:
        # pokreni refresh...
```

**Lock** (brava) — sprječava da se isti kod izvrši više puta istovremeno. Zamišljaj kao WC u vlaku — ako je zauzet, čekaš van. Bez brave, dva simultana refresha bi mogli napraviti kaos u bazi.

```python
result = await asyncio.to_thread(
    subprocess.run,
    [sys.executable, SCRAPER_SCRIPT],
    ...
)
```

Scraper se pokreće kao **subprocess** (odvojeni proces). Zašto ne direktno? Jer `httpx` (koji scraper koristi) i FastAPI server dijele isti event loop — pokretanje scrapera direktno bi blokiralo server. Odvojeni proces to rješava.

`asyncio.to_thread()` — pokreni blokirajuću funkciju (subprocess.run) u zasebnoj niti, ne blokirajući event loop.

```python
@app.on_event("startup")
async def startup():
    await init_db()
    scheduler.add_job(refresh_data, "interval", minutes=15, ...)
    scheduler.start()
    asyncio.create_task(refresh_data())
```

`@app.on_event("startup")` — decorator koji govori FastAPI-ju "izvrši ovu funkciju kada se server pokrene".

**APScheduler** — biblioteka za zakazivanje zadataka. `"interval", minutes=15` znači "ponovi svake 15 minuta".

`asyncio.create_task()` — pokreni refresh_data odmah, ali ne čekaj da završi (server nastavlja raditi).

```python
@app.get("/api/data")
async def api_data():
    return await get_all_data()

@app.post("/api/refresh")
async def api_refresh():
    if _refresh_lock.locked():
        raise HTTPException(status_code=409, detail="Refresh already in progress.")
    asyncio.create_task(refresh_data())
    return {"status": "started"}
```

**HTTP metode:**
- `GET` — dohvati podatke (browser otvara stranicu, JS čita API)
- `POST` — pošalji naredbu (pritisak na gumb "Osvježi")

**HTTP status kodovi:**
- `200 OK` — sve ok (default)
- `404 Not Found` — stranica ne postoji
- `409 Conflict` — zahtjev u sukobu s trenutnim stanjem (refresh već traje)

```python
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

@app.get("/")
async def index():
    return FileResponse(os.path.join(STATIC_DIR, "index.html"))
```

`app.mount("/static", ...)` — sve što browser traži s putanje `/static/...` servirat će se iz `static/` foldera.

`@app.get("/")` — kad browser posjeti početnu stranicu (`/`), pošalji mu `index.html`.

---

## 8. HTML

**Datoteka:** `static/index.html`

### Što je HTML?

HyperText Markup Language — jezik za opisivanje strukture web stranica. Koristiš **tagove** (oznake) da opišeš što je što.

### Osnove HTML-a

```html
<!DOCTYPE html>              <!-- Govori browseru: ovo je HTML5 dokument -->
<html lang="hr">             <!-- Korijenski element, jezik: hrvatski -->
  <head>                     <!-- Metapodaci (nisu vidljivi korisniku) -->
    <meta charset="UTF-8" /> <!-- Kodiranje znakova (za šumska č, ć, ž...) -->
    <title>Dinamo Zagreb</title>
    <link rel="stylesheet" href="/static/style.css?v=6" />
  </head>
  <body>                     <!-- Vidljivi sadržaj -->
    <h1>Dinamo Zagreb</h1>
    <p>Neki tekst</p>
  </body>
</html>
```

### Zašto `?v=6` na kraju CSS i JS linka?

Ovo je **cache-buster**. Browseri pamte (cache) CSS i JS datoteke da ne moraju svaki puta downloadati. Problem: kad promijeniš datoteku, browser može koristiti staru verziju iz cache-a.

Rješenje: dodaj version broj kao query parameter. Browser vidi `/static/style.css?v=6` kao drugačiji URL od `/static/style.css?v=5`, pa uvijek downloadira svježu verziju.

### Struktura naše HTML stranice

```html
<body>
  <!-- HEADER — gornji tamni dio s logom i pillovima -->
  <header class="header">
    <div class="header-inner">

      <!-- Gornji red: logo + naziv + gumb osvježi -->
      <div class="header-top">
        <div class="header-club">
          <img src="/static/dinamo-logo.png" alt="Dinamo Zagreb">
          <h1>DINAMO</h1>
          <p id="header-subtitle">Zagreb</p>
        </div>
        <button onclick="manualRefresh()">Osvježi</button>
      </div>

      <!-- Pills za odabir kategorije: Seniori / U17 / U15 / U13 -->
      <div id="pills"></div>
    </div>
  </header>

  <!-- QUICK STATS — #1 / 16 bod. / 8 / 0 / 1 / Forma -->
  <div id="quick-stats">
    <span id="stat-pos">—</span>
    <span id="stat-pts">—</span>
    <span id="stat-won">—</span>
    <span id="stat-drawn">—</span>
    <span id="stat-lost">—</span>
    <div id="forma"></div>
  </div>

  <!-- TAB BAR — Rezultati / Tablica / Raspored -->
  <nav class="tab-bar">
    <button data-tab="rezultati" onclick="switchMainTab('rezultati')">Rezultati</button>
    <button data-tab="tablica"   onclick="switchMainTab('tablica')">Tablica</button>
    <button data-tab="raspored"  onclick="switchMainTab('raspored')">Raspored</button>
  </nav>

  <!-- GLAVNI SADRŽAJ — ovdje JS dinamički ubacuje kartice -->
  <main class="main">
    <div id="loading">...</div>   <!-- vidi se dok se učitava -->
    <div id="content"></div>      <!-- ovdje idu kartice -->
    <div id="error"></div>        <!-- vidi se ako dođe do greške -->
  </main>

  <div class="last-updated-bar">Made by Čupko</div>

  <!-- JavaScript se učitava na KRAJU — da HTML bude prikazan prije -->
  <script src="/static/app.js?v=9"></script>
</body>
```

### Ključni koncepti

**`id` vs `class`:**
- `id="quick-stats"` — jedinstven identifikator, jedan element na stranici. JS ga dohvaća s `document.getElementById("quick-stats")`
- `class="header"` — može se koristiti za više elemenata. CSS ga stilizira s `.header { ... }`

**`onclick`:**
```html
<button onclick="manualRefresh()">Osvježi</button>
```
Kad korisnik klikne gumb, browser izvrši JavaScript funkciju `manualRefresh()`.

**`data-tab` atribut:**
```html
<button data-tab="rezultati">Rezultati</button>
```
Vlastiti atributi za pohranu podataka. JS ih čita s `btn.dataset.tab`.

---

## 9. CSS

**Datoteka:** `static/style.css`

### Što je CSS?

Cascading Style Sheets — jezik za opisivanje izgleda HTML elemenata. "Kaskadni" jer se pravila primjenjuju jedno na drugo, a specifičniji selektor pobijedi.

### CSS Varijable

```css
:root {
  --bg:         #f0f2f5;   /* pozadina stranice */
  --card:       #ffffff;   /* bijela kartica */
  --header-bg:  #0f1d3d;   /* tamno plava zaglavlje */
  --accent:     #1d4ed8;   /* jarko plava za naglasak */
  --text:       #111827;   /* gotovo crni tekst */
  --win-bg:     #16a34a;   /* zelena za pobjedu */
  --loss-bg:    #dc2626;   /* crvena za poraz */
  --draw-bg:    #d97706;   /* narančasta za neriješeno */
}
```

`--naziv` su CSS custom properties (varijable). Definiraš ih u `:root` (korijenski element) i koristiš ih svugdje:

```css
.some-element {
  background: var(--accent);  /* koristi vrijednost varijable */
  color: #fff;
}
```

**Prednost:** Promijeniš boju jednom u `:root`, promijeni se svugdje. Savršeno za teme (light/dark mode).

### Selektori

```css
/* Selektor po elementu */
body { font-family: 'Outfit', sans-serif; }

/* Selektor po klasi (.) */
.header { background: var(--header-bg); }

/* Selektor po ID-u (#) */
#quick-stats { display: flex; }

/* Kombinirani: element s klasom */
.match-team--dinamo { color: var(--accent); }

/* Pseudoklasa: hover */
.pill:hover { background: rgba(255,255,255,.15); }

/* Pseudoklasa: aktivna klasa */
.pill.active { background: var(--accent); }
```

### Box Model

Svaki HTML element je "kutija":

```
┌─────────────────────────────┐
│          margin             │  ← razmak od susjednih elemenata
│  ┌───────────────────────┐  │
│  │        border         │  │  ← obrub
│  │  ┌─────────────────┐  │  │
│  │  │    padding      │  │  │  ← unutarnji razmak
│  │  │  ┌───────────┐  │  │  │
│  │  │  │  content  │  │  │  │  ← stvarni sadržaj
│  │  │  └───────────┘  │  │  │
│  │  └─────────────────┘  │  │
│  └───────────────────────┘  │
└─────────────────────────────┘
```

```css
.match-card {
  padding: .75rem 1rem;      /* unutarnji razmak: 0.75rem gore/dolje, 1rem lijevo/desno */
  margin-bottom: .45rem;     /* vanjski razmak prema dolje */
  border: 1px solid #e5e7eb; /* 1px crta, sivo */
  border-radius: 6px;        /* zaobljeni kutevi */
}
```

**rem** = relative em = veličina relativna root font-sizeu (standardno 16px). `1rem = 16px`, `.75rem = 12px`.

### Flexbox

Najkorišteniji način rasporeda elemenata:

```css
.match-body {
  display: flex;           /* aktivira flexbox */
  align-items: center;     /* centrira po vertikalnoj osi */
  justify-content: space-between;  /* raspoređuje po horizontali */
  gap: .5rem;              /* razmak između flex elemenata */
}
```

```css
.header-right {
  display: flex;
  flex-direction: column;  /* stavlja elemente okomito (default je row = vodoravno) */
  align-items: flex-end;   /* poravna na desno */
}
```

### Grid

Za rasporede u rešetki:

```css
.match-body {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  /* 3 stupca:
     1fr = fleksibilno širi se  (domaćin)
     auto = onoliko koliko treba (rezultat)
     1fr = fleksibilno širi se  (gost) */
}
```

### Animacije

```css
@keyframes spin {
  to { transform: rotate(360deg); }
}

.spinner {
  animation: spin .7s linear infinite;
  /* trajanje: 0.7 sekundi
     tempo: linearan (jednolika brzina)
     ponavljanje: beskonačno */
}

@keyframes blink {
  0%, 100% { opacity: 1; }    /* puno vidljivo */
  50%       { opacity: .3; }  /* gotovo nevidljivo */
}
```

### Position: sticky

```css
.tab-bar {
  position: sticky;
  top: 0;       /* "zalijepi" se 0px od vrha viewporta */
  z-index: 100; /* bude "ispred" ostalog sadržaja */
}
```

Tab bar ostaje vidljiv dok skrolaš dolje.

---

## 10. JavaScript

**Datoteka:** `static/app.js`

### Što je JavaScript u browseru?

JavaScript je programski jezik koji se izvodi direktno u browseru. Može:
- Dohvaćati podatke s API-ja (bez reloadanja stranice)
- Dinamički mijenjati HTML sadržaj
- Reagirati na korisničke akcije (klik, scroll...)

### Async/Await u JavaScriptu

```javascript
// Dohvati podatke s API-ja
async function loadData() {
  try {
    const res = await fetch("/api/data");  // pošalji HTTP GET zahtjev
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();         // parsiraj JSON odgovor
    // ovdje radi s podacima...
  } catch (e) {
    showError("Greška: " + e.message);
  }
}
```

`fetch()` je ugrađena JS funkcija za HTTP zahtjeve. Vraća **Promise** — obećanje da će rezultat biti dostupan u budućnosti.

`await` govori: "čekaj da Promise bude riješen". Bez `await`, kod bi nastavio izvršavati se odmah, bez podataka.

`try/catch` — kao u Pythonu, hvata greške.

### Stanje aplikacije (State)

```javascript
let allData   = [];   // svi podaci dohvaćeni s API-ja
let activeAge = 0;    // trenutno odabrana kategorija (indeks u allData)
let activeTab = "rezultati";  // trenutno odabrani tab
```

**State** (stanje) su varijable koje pamte što se trenutno događa. Svaka promjena stanja (novi klik, novi podaci) treba ažurirati UI.

### DOM manipulacija

**DOM** (Document Object Model) — JavaScript "vidi" HTML kao stablo objekata. Možeš kreirati, mijenjati i brisati HTML elemente.

```javascript
// Dohvati postojeći element
const el = document.getElementById("quick-stats");

// Promijeni tekst
document.getElementById("stat-pos").textContent = "#" + myRow.rank;

// Kreiraj novi element
const card = document.createElement("div");
card.className = "match-card";
card.textContent = "Neki tekst";

// Dodaj u DOM
document.body.appendChild(card);

// Dodaj/ukloni CSS klasu
btn.classList.add("active");
btn.classList.remove("active");
btn.classList.toggle("active", condition);  // dodaj ako je condition true
```

### Izgradnja match kartice

```javascript
function matchCard(m) {
  const isDom  = isDinamo(m.home_team);  // je li Dinamo domaćin?
  const isGost = isDinamo(m.away_team);  // je li Dinamo gost?
  const res    = matchResult(m);         // P/N/G + boja

  // Kreiraj div.match-card
  const card = document.createElement("div");
  card.className = "match-card" + (isDom || isGost ? " match-card--dinamo" : "");
  //                              ↑ ako je Dinamo igrao, dodaj extra klasu

  // Kreiraj tijelo s timovima i rezultatom
  const body = document.createElement("div");
  body.className = "match-body";

  // Tim domaćin
  const home = document.createElement("div");
  home.className = "match-team match-team--home" + (isDom ? " match-team--dinamo" : "");
  home.textContent = m.home_team;

  // Rezultat
  const score = document.createElement("div");
  score.className = "match-score";
  score.textContent = `${m.home_score}:${m.away_score}`;
  // Template literal — backtick (`) umjesto navodnika, ${...} za vrijednosti

  // Slozi zajedno
  body.appendChild(home);
  body.appendChild(score);
  body.appendChild(away);
  card.appendChild(body);

  return card;
}
```

### Arrow functions (moderne JS funkcije)

```javascript
// Klasična funkcija:
function isDinamo(name) {
  return CLUB_KEYWORDS.some(function(k) { return name.toLowerCase().includes(k); });
}

// Ista funkcija, moderniji zapis s arrow functionom:
const isDinamo = (name) => {
  if (!name) return false;
  const n = name.toLowerCase();
  return CLUB_KEYWORDS.some(k => n.includes(k));
};
```

Arrow funkcija `k => n.includes(k)` je kratka forma za `function(k) { return n.includes(k); }`.

### Array metode

```javascript
// filter() — zadrži samo elemente koji zadovoljavaju uvjet
const played = comp.matches
  .filter(m => m.status === "played")      // samo odigrane
  .filter(m => isDinamo(m.home_team) || isDinamo(m.away_team));  // samo Dinamo

// sort() — sortiraj
const sorted = played.sort((a, b) => parseDateStr(b.date) - parseDateStr(a.date));
// Negativan rezultat = a ide ispred b
// Pozitivan rezultat = b ide ispred a
// Ovdje: veći datum (noviji) ide naprijed → padajući redoslijed

// map() — transformiraj svaki element
const teams = standings.map(row => row.team);
// Vraća: ["Dinamo Zagreb", "Maksimir - Pastela 2", ...]

// find() — pronađi prvi element koji zadovoljava uvjet
const myRow = standings.find(s => isDinamo(s.team));

// some() — postoji li ikoji element koji zadovoljava uvjet? (vraća true/false)
const hasDinamo = standings.some(s => isDinamo(s.team));

// forEach() — prođi kroz sve elemente
matches.forEach(m => {
  frag.appendChild(matchCard(m));
});
```

### Datum parsing

```javascript
function parseDateStr(d) {
  if (!d) return 0;
  // ISO format: "2026-03-14"
  if (/^\d{4}-\d{2}-\d{2}/.test(d)) return new Date(d).getTime();
  // Hrvatski format: "31.1.26."
  const parts = d.replace(/\.$/, "").split(".");
  // ...
}
```

**Regular expression** (RegExp):
- `/^\d{4}-\d{2}-\d{2}/` je pattern
- `^` — početak stringa
- `\d{4}` — točno 4 broja
- `-` — crtica
- `\d{2}` — točno 2 broja
- `.test(d)` — provjeri odgovara li pattern stringu `d`

`new Date("2026-03-14").getTime()` — pretvori datum u millisekunde od 1.1.1970. Dobijemo broj, a brojeve je lako uspoređivati za sortiranje.

### Formatiranje datuma za prikaz

```javascript
function fmtDate(d) {
  if (!d) return "—";
  if (/^\d{4}-\d{2}-\d{2}/.test(d)) {
    const dt = new Date(d);
    return `${dt.getDate()}. ${dt.getMonth() + 1}. ${dt.getFullYear()}.`;
    // → "14. 3. 2026."
  }
  return d;
}
```

`getMonth()` vraća 0-11 (siječanj = 0), zato `+1`.

### Polling — čekanje da se podaci osvježe

```javascript
async function pollUntilUpdated(maxSeconds) {
  const snapshot = allData.map(d => d.last_updated);  // zapamti trenutne timestampove
  const deadline = Date.now() + maxSeconds * 1000;     // rok (u ms)

  while (Date.now() < deadline) {
    await sleep(3000);  // čekaj 3 sekunde
    try {
      const r = await fetch("/api/data");
      const fresh = await r.json();
      // Provjeri je li se ikoji timestamp promijenio
      if (fresh.some((d, i) => d.last_updated !== snapshot[i])) return;
    } catch (_) {}  // ignoriraj greške pri pollingu
  }
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}
```

Ovo je **polling pattern** — periodično provjeravaj je li se nešto promijenilo.

`setTimeout(callback, ms)` — izvrši callback nakon ms millisekundi.
`new Promise(r => ...)` — kreiraj Promise koji se "rješava" (`r(...)`) kad setTimeout okine.

---

## 11. Kako sve zajedno radi

### Tijek jednog refresha (primjer)

```
Korisnik klikne "Osvježi"
    ↓
manualRefresh() [JS]
    ↓
POST /api/refresh [HTTP zahtjev]
    ↓
api_refresh() [FastAPI]
    ↓
asyncio.create_task(refresh_data()) — pokreni u pozadini
    ↓
vrati {"status": "started"} odmah
    ↓
pollUntilUpdated(90) [JS] — svake 3s provjeravaj GET /api/data
    ↓
refresh_data() [FastAPI, u pozadini]
    ↓
subprocess: python refresh_scraper.py
    ↓
scrape_all([1677, 1705, 1706, 1707])
    ↓
za svaki ID: fetch JS datoteke → parse → extract Dinamo grupa
    ↓
save_competition_data() [database.py]
    ↓
scraper završi → last_updated se promijeni u bazi
    ↓
pollUntilUpdated vidi promjenu → prestaje pollati
    ↓
loadData() [JS] — dohvati novi /api/data
    ↓
render() — nacrtaj UI s novim podacima
```

### Tijek prvog posjeta stranici

```
Browser otvori http://localhost:8080/
    ↓
GET / [HTTP zahtjev]
    ↓
index() [FastAPI] — vrati index.html
    ↓
Browser parsira HTML, vidi <link rel="stylesheet" href="/static/style.css">
    ↓
GET /static/style.css [HTTP zahtjev]
    ↓
StaticFiles middleware vrati style.css
    ↓
Browser parsira HTML dalje, vidi <script src="/static/app.js">
    ↓
GET /static/app.js [HTTP zahtjev]
    ↓
Browser izvrši app.js → document.addEventListener("DOMContentLoaded", loadData)
    ↓
Kad je HTML potpuno učitan, loadData() se izvrši
    ↓
GET /api/data [HTTP zahtjev]
    ↓
api_data() [FastAPI] → get_all_data() [SQLite] → JSON odgovor
    ↓
allData = JSON podaci
    ↓
buildPills() — kreiraj Seniori/U17/U15/U13 gumbiće
    ↓
render() → renderQuickStats() + renderContent()
    ↓
Korisnik vidi podatke
```

---

## 12. Deploy

### Zašto Render?

- Besplatni tier
- Automatski deploy iz GitHub repoa
- Nema potrebe za Playright/Chromium (naš novi scraper koristi samo httpx)
- Podrška za Python

### Koraci

**1. Inicijaliziraj Git repozitorij**

Git je **version control system** — prati promjene u kodu, omogućuje suradnju i rollback.

```bash
git init                    # inicijaliziraj novi repo
git add .                   # dodaj sve datoteke
git commit -m "Initial commit"  # spremi snapshot
```

**2. Stavi na GitHub**

```bash
# Idi na github.com, napravi novi repozitorij "dinamo-tracker"
git remote add origin https://github.com/TVOJE_IME/dinamo-tracker.git
git push -u origin master
```

**3. Deploys na Render**

1. Idi na render.com → New → Web Service
2. Poveži GitHub repozitorij
3. Render automatski vidi `render.yaml` i konfigurira se

### render.yaml

```yaml
services:
  - type: web             # web server
    name: dinamo-tracker  # naziv usluge
    runtime: python       # Python
    buildCommand: pip install -r requirements.txt  # instalacija paketa
    startCommand: uvicorn app:app --host 0.0.0.0 --port $PORT
    plan: free
```

`uvicorn` — ASGI server koji pokreće FastAPI aplikaciju.
`app:app` — "iz datoteke `app.py`, uzmi objekt `app`"
`$PORT` — Render automatski assigna port, mi ga koristimo

### Napomena o bazi podataka

Render free tier ima **ephemeral filesystem** — pri svakom restartu server se resetira na čisto. Naša SQLite baza (`data.db`) se gubi!

Ali to nije problem jer:
1. Pri startu `startup()` poziva `refresh_data()`
2. Refresh dohvaća sve podatke iz sportinfocentar2.com
3. Baza se napuni u roku 5 sekundi

---

## 13. Što sljedeće naučiti

### Neposredni sljedeći koraci

1. **Python osnove** — Nauči solidno: tipove podataka, funkcije, klase, moduli, error handling
   - Besplatno: https://docs.python.org/3/tutorial/
   - Preporučena knjiga: "Automate the Boring Stuff with Python"

2. **HTML/CSS osnove** — Prođi MDN Web Docs tutoriale
   - https://developer.mozilla.org/en-US/docs/Learn

3. **JavaScript osnove** — "The Modern JavaScript Tutorial"
   - https://javascript.info/ (ima i prijevod na hrvatski)

4. **Git i GitHub** — Osnove version controla
   - https://learngitbranching.js.org/ (interaktivno, vizualno)

### Nadogradnje ovog projekta (praktično učenje)

Pokušaj sam implementirati:

- **[ ]** Detalji utakmice — klik na karticu otvori detaljan pregled
- **[ ]** Push notifikacije — obavijesti kad Dinamo odigra utakmicu
- **[ ]** Statistike strijelaca — dodaj tablicu sa postignutim golovima
- **[ ]** Usporedba sezona — arhiva prethodnih sezona
- **[ ]** Dark mode — prebaci dizajn u tamni mod

### Naprednije tehnologije

Nakon što ovladaš osnovama, sljedeći korak je:

- **React** — JavaScript framework za kompleksnije UI-je
- **PostgreSQL** — prava baza podataka za produkciju (umjesto SQLite)
- **Docker** — pakiranje aplikacije u kontejner (isti na svakom računalu)
- **CI/CD** — automatski testovi i deploy pri svakom git push-u

---

## Zaključak

Ovo što smo izgradili nije mala stvar. Ovaj projekt koristi:

| Tehnologija | Kategorija | Zašto |
|-------------|------------|-------|
| Python      | Backend jezik | Čitljiv, popularan, bogat ekosistem |
| FastAPI     | Web framework | Brz, moderan, automatska dokumentacija |
| SQLite      | Baza podataka | Jednostavna, bez instalacije |
| httpx       | HTTP klijent | Dohvaćanje podataka s interneta |
| chompjs     | Parser | Čitanje JS formata podataka |
| HTML5       | Struktura | Kostur stranice |
| CSS3        | Dizajn | Izgled i animacije |
| JavaScript  | Frontend logika | Interaktivnost bez reloada |
| Git/GitHub  | Version control | Praćenje promjena i backup |
| Render      | Cloud hosting | Besplatno postavljanje na internet |

Svaki od ovih dijelova je disciplina za sebe — ali kombiniranjem ih grade profesionalne web aplikacije.

Ključ nije znati sve odjednom, nego razumjeti **kako dijelovi komuniciraju** i postepeno produbljivati znanje u svakom dijelu.

---

*Vodič napisan za projekt Dinamo Zagreb Handball Tracker, 2026.*
