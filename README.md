# Πάμε Σέντρα

Αποτελέσματα, βαθμολογίες και γήπεδα ερασιτεχνικού ποδοσφαίρου, ανά Ένωση
Ποδοσφαιρικών Σωματείων (ΕΠΣ). Ξεκινά με την ΕΠΣ Ηπείρου, αλλά το data model
είναι multi-tenant από την πρώτη γραμμή.

## Πού βρισκόμαστε

| Φάση | Τι | Κατάσταση |
|---|---|---|
| 1 | Multi-tenant schema | ✅ |
| 2 | Read-only public API | ✅ |
| 2 | Scraper (engine + adapter ανά πλατφόρμα) | ✅ epsip.gr |
| 2 | Next.js public frontend | ✅ |
| 3 | Auth, ρόλοι, audit log | 🟡 πίνακες υπάρχουν, endpoints όχι |
| 4 | Editor dashboard | ⬜ |
| 5 | Reconciliation scraper ↔ manual | ✅ |
| 6 | Live polling στο frontend | ✅ |

## Setup

Χρειάζεσαι Docker και Python 3.11+.

```bash
docker compose up -d                  # PostgreSQL 16 στο :5432

cd backend
python -m venv .venv
./.venv/Scripts/python.exe -m pip install -r requirements.txt   # Windows
# source .venv/bin/activate && pip install -r requirements.txt  # macOS/Linux

cp .env.example .env
./.venv/Scripts/python.exe -m alembic upgrade head
./.venv/Scripts/python.exe -m scripts.seed
./.venv/Scripts/python.exe -m uvicorn app.main:app --reload
```

Σε δεύτερο terminal:

```bash
cd frontend
npm install
cp .env.example .env.local
npm run dev
```

Και για να γεμίσει η βάση από το epsip.gr αντί για dev data:

```bash
cd backend
./.venv/Scripts/python.exe -m scripts.bootstrap_ipeirou
./.venv/Scripts/python.exe -m app.scraper.run --association epsip-ipeirou --dry-run
```

Το `--dry-run` κατεβάζει και αναλύει χωρίς να γράψει τίποτα· βγάλ' το όταν η
αναφορά δείχνει αυτό που περιμένεις. Βάλε πρώτα πραγματικό email στο
`SCRAPER_USER_AGENT` — ο scraper το λέει, αλλά δεν σε σταματά.

Και για να τρέχει μόνος του αντί να τον θυμάσαι:

```bash
./.venv/Scripts/python.exe -m app.scraper.schedule          # daemon
./.venv/Scripts/python.exe -m app.scraper.schedule --once   # ένας κύκλος (cron)
```

Ο scheduler διαβάζει το πρόγραμμα αγώνων και αλλάζει ρυθμό μόνος του: κάθε 5
λεπτά όσο υπάρχει σέντρα μέσα στο παράθυρό της, κάθε 6 ώρες τις υπόλοιπες
μέρες. Ένα σταθερό διάστημα θα έπρεπε να διαλέξει ανάμεσα στο να είναι αργό
την Κυριακή και στο να χτυπάει το site της ένωσης όλη την εβδομάδα.

Και δεν κατεβάζει τα ίδια: σε live παράθυρο ζητά **μόνο τις κατηγορίες που
παίζουν** (συνήθως μία ή δύο), ενώ η αραιή σάρωση τα διαβάζει όλα — εκεί
εμφανίζονται νέα σεζόν, αναβολές και καθυστερημένες διορθώσεις. Μια πλήρης
σάρωση εδώ είναι ~60 αιτήματα· επαναλαμβανόμενη κάθε 5 λεπτά θα κρατούσε ένα
μικρό site απασχολημένο μισή Κυριακή.

> **Μην καρφώνεις `period_id` ή `league_ids` στο `scraper_config`.** Είναι τα
> αναγνωριστικά *μίας* σεζόν στην πηγή. Όσο υπήρχαν, ο scraper ξαναδιάβαζε τη
> σεζόν 2025-2026 αφότου η ένωση είχε προχωρήσει, και ένα τρέξιμο για τη νέα
> σεζόν γύριζε «η πηγή δεν επέστρεψε καμία διοργάνωση» επειδή τα league ids δεν
> υπήρχαν πια. Χωρίς αυτά, ακολουθείται αυτόματα η νεότερη σεζόν. Για να μη
> μπαίνουν διοργανώσεις που φιλοξενούνται απλώς στο site, υπάρχει το
> `exclude_categories`, που ταιριάζει σε ονόματα και δεν παλιώνει.

API: <http://127.0.0.1:8000/docs> · Site: <http://127.0.0.1:3000>

### Όλα μαζί σε containers

Για deployment — ή για να δεις το σύνολο να τρέχει χωρίς δύο terminals:

```bash
cp .env.example .env     # βάλε πραγματικό email στο SCRAPER_USER_AGENT
docker compose up -d --build
```

Σηκώνει `db` → `migrate` (τρέχει και βγαίνει) → `api` → `web`, και ξεχωριστά
τον `scraper` ως daemon. Το `migrate` είναι δική του υπηρεσία ώστε να μην
τρέχουν API και scraper migrations ταυτόχρονα.

Δύο πράγματα που δαγκώνουν:

- **`NEXT_PUBLIC_*` είναι build-time.** Το Next τα ενσωματώνει στο client
  bundle, άρα αλλαγή θέλει `docker compose build web`, όχι restart. Και το
  `NEXT_PUBLIC_API_URL` πρέπει να είναι η διεύθυνση που λύνει ο browser του
  αναγνώστη — ένα hostname του compose εκεί φεύγει για τον κόσμο και σκάει.
- Γι' αυτό υπάρχει και το **`API_INTERNAL_URL`**: το server μισό του site το
  διαβάζει σε κάθε request και μιλά στο `api:8000` μέσα στο δίκτυο, αντί να
  βγει στο internet για να ξαναμπεί στο ίδιο μηχάνημα.

Ο `scraper` δεν σηκώνεται χωρίς `SCRAPER_USER_AGENT` — το compose το απαιτεί
ρητά αντί να αφήσει ένα CHANGE-ME να φτάσει σε ζωντανό site.

Το `scripts/seed.py` βάζει την ΕΠΣ Ηπείρου με 10 ομάδες, 10 γήπεδα και 90
αγώνες. **Τα ονόματα σωματείων και γηπέδων είναι πραγματικά, τα σκορ και οι
ημερομηνίες όχι** — είναι dev data. Το script αρνείται να πειράξει ένωση που
υπάρχει ήδη· θέλει ρητό `--reset`.

## Ημερολόγιο

Κάθε σωματείο έχει feed που συγχρονίζεται μόνο του:

```
GET /api/v1/{ένωση}/teams/{slug}/imerologio.ics
```

Τρέχουσα περίοδος από προεπιλογή — `?season=2025-2026` για άλλη, `?season=all`
για όλο το αρχείο. Η προεπιλογή δεν είναι αυθαίρετη: ένα παλιό σωματείο έχει
1.187 αγώνες σε 13 περιόδους, δηλαδή ένα τρίτο του μεγαβάιτ με σέντρες του
2014 που ξανακατεβαίνει κάθε έξι ώρες στο κινητό κάποιου.

Στη σελίδα σωματείου υπάρχει κουμπί εγγραφής (`webcal:` για iOS και Outlook)
και αντιγραφή διεύθυνσης, γιατί το Google Calendar στο Android θέλει
επικόλληση στο «Από URL».

## Λογαριασμοί

Δεν υπάρχει δημόσια εγγραφή: η πρόσβαση εγγραφής σε ζωντανά αποτελέσματα
δίνεται σε λίγους γνωστούς ανθρώπους, οπότε οι λογαριασμοί φτιάχνονται από
γραμμή εντολών.

```bash
cd backend
./.venv/Scripts/python.exe -m scripts.create_user --email admin@example.gr --role admin
./.venv/Scripts/python.exe -m scripts.create_user     --email editor@example.gr --association epsip-ipeirou --live --generate-password
```

Ο κωδικός ζητείται σε prompt, ποτέ ως όρισμα — το ιστορικό του shell και η
λίστα διεργασιών διαβάζονται από οποιονδήποτε στο μηχάνημα.

| Endpoint | Τι κάνει |
|---|---|
| `POST /api/v1/auth/login` | Θέτει httpOnly cookie· επιστρέφει τον λογαριασμό και τις ενώσεις του |
| `POST /api/v1/auth/logout` | Σβήνει το cookie |
| `GET /api/v1/auth/me` | Ποιος είμαι και τι μπορώ να αγγίξω |

### Διαχείριση

Το dashboard είναι στο `/diaxeirisi` — login, διόρθωση σκορ, συμπλήρωση
γηπέδων και ιστορικό αλλαγών. Δεν ευρετηριάζεται (`noindex`).

| Endpoint | Τι κάνει |
|---|---|
| `GET /api/v1/{ένωση}/editor/matches` | Οι αγώνες του παραθύρου (±μέρες) |
| `PATCH /api/v1/{ένωση}/editor/matches/{id}` | Σκορ, κατάσταση, λεπτό, σημείωση |
| `PATCH /api/v1/{ένωση}/editor/fields/{slug}` | Στοιχεία γηπέδου **και συντεταγμένες** |
| `GET /api/v1/{ένωση}/editor/audit` | Ποιος άλλαξε τι |

> **Cookie και domains.** Η συνεδρία είναι httpOnly cookie με `SameSite=Lax`,
> και ο browser το στέλνει στο API μόνο αν τα δύο είναι **same-site** —
> `pamesentra.gr` και `api.pamesentra.gr` είναι, δύο άσχετα domains δεν είναι.
> Αν το API καταλήξει σε ξεχωριστό domain, το cookie θέλει `SameSite=None`
> **και** HTTPS, αλλιώς κάθε κλήση του dashboard γυρίζει 401 που μοιάζει με
> λάθος κωδικό. Το `CORS_ORIGINS` πρέπει επίσης να περιλαμβάνει τη διεύθυνση
> του site.


Δύο επίπεδα: **admin** (καθολικός, χωρίς γραμμές στο `user_associations`) και
**editor** (φτάνει μόνο όπου του δόθηκε). Ξεχωριστά από την πρόσβαση είναι το
`can_edit_live` — το να βλέπεις μια ένωση και το να σου εμπιστεύονται σκορ όσο
παίζεται ο αγώνας είναι διαφορετικά πράγματα, γιατί μια live διόρθωση υπερισχύει
της επίσημης πηγής για 48 ώρες.

## Δομή

```
backend/
  app/
    core/         config, db session, console encoding
    models/       SQLAlchemy — associations, seasons, leagues, teams,
                  fields, matches, standings, users, audit_log
    schemas/      Pydantic response models
    api/
      deps.py     tenant/season/league resolution
      v1/public.py  read-only endpoints
    services/
      standings.py  υπολογισμός βαθμολογίας από τους αγώνες
    scraper/
      http.py       ευγενικό fetching: robots.txt, delay, retries
      naming.py     αντιστοίχιση ονομάτων σωματείων, slugs, μονογράμματα
      labels.py     ανάγνωση τίτλου διοργάνωσης σε label/ηλικία/όμιλο/tier
      decisions.py  τι επιτρέπεται να αλλάξει ένα scrape
      sync.py       το γράψιμο στη βάση
      sources/      ένας adapter ανά πλατφόρμα (epsip.py)
  alembic/        migrations
  scripts/        seed, bootstrap, relabel, set_zones, audit, completeness
frontend/
  src/
    app/          App Router: /, /vathmologia, /apotelesmata,
                  /programma, /gipeda, /somateia, /somateia/[slug]
    components/   MatchCard, StandingsTable, LiveMatches, nav, states
    lib/          api client, types, Greek formatting, nav config
    styles/       tokens.css (το UI kit), globals.css
docker-compose.yml
```

## Αποφάσεις που αξίζει να ξέρεις

**Tenant scoping.** Κάθε public route περνά από το `get_association` dependency
και ζει κάτω από `/api/v1/{association_slug}`. Δεν υπάρχει route που να
επιστρέφει δεδομένα χωρίς ένωση — εκτός από το `/api/v1/associations`, που
ακριβώς λέει ποιες ενώσεις υπάρχουν.

**Ελληνική ταξινόμηση.** Η βάση στήνεται με ICU collation `el-GR`. Το
`postgres:16-alpine` είναι musl-based και αγνοεί σιωπηλά ένα glibc locale σαν
`el_GR.UTF-8` — γυρνά σε byte order, που βάζει το «Ήπειρος» πριν το «Ζίτσα».
Με ICU: Άρτα, Ζίτσα, Ήπειρος, Ιωάννινα, Ωρωπός.

**Βαθμολογία = παράγωγο.** Δεν γράφεται με το χέρι ποτέ. Ο editor διορθώνει σκορ
και το `recompute_standings` ξαναχτίζει όλο τον πίνακα. Ισοβαθμία: βαθμοί →
μεταξύ τους αποτελέσματα → διαφορά τερμάτων → τέρματα υπέρ.

**Reconciliation.** Το `Match.scraper_may_overwrite()` κρατά τον κανόνα: μια
χειροκίνητη αλλαγή νικά τον scraper, αλλά μόνο για 48 ώρες μετά την έναρξη.
Μετά, το επίσημο αποτέλεσμα ξαναγίνεται αυθεντία μόνο του — αλλιώς κάθε live
αγώνας θα περίμενε άνθρωπο για να συμφωνήσει ποτέ με το epsip.gr.

**Enums ως varchar.** `native_enum=False` παντού. Το να προσθέσεις τιμή σε PG
enum αργότερα είναι `ALTER TYPE`· σε varchar+CHECK είναι ένα κανονικό migration.

**Χωρίς `python -m` δεν τρέχει.** Τα scripts κάνουν `from app...`, οπότε
`python -m scripts.seed` από το `backend/`, όχι `python scripts/seed.py`.

**Ένα deployment = μία ένωση.** Το API είναι tenant-scoped στο URL, αλλά οι
διευθύνσεις που βλέπει ο αναγνώστης δεν είναι: `/vathmologia`, όχι
`/epsip-ipeirou/vathmologia`. Η ένωση λύνεται σε ένα σημείο, το `ASSOCIATION`
στο `src/lib/api.ts`, που σήμερα διαβάζει env var. Όταν έρθει 2η ένωση αλλάζει
μόνο αυτό, ώστε να διαβάζει subdomain.

**Χρώματα.** Όλα τα χρώματα ζουν στο `src/styles/tokens.css` (Πάμε Σέντρα UI
kit v2). Κανένα component δεν γράφει hex — μόνο token names.

Δύο σημεία όπου η παλέτα χρειάστηκε προσοχή, γιατί το ίδιο το kit τα σημειώνει:
λευκό πάνω σε green-600 δίνει 4.3:1 και πάνω σε terra-500 3.9:1 — και τα δύο
κόβονται για μικρά γράμματα. Οπότε τα form pills και το LIVE chip παίρνουν
σκούρο μελάνι σε ανοιχτό φόντο (ή terra-700 αντί terra-500). Το hover των links
μένει green-600 όπως το ορίζει το kit, παρότι είναι 4.3:1 — στιγμιαία
κατάσταση, αλλά γι' αυτό το πράσινο δεν ορίζει ποτέ κείμενο σε ηρεμία.

**Ελληνικά κεφαλαία.** `toLocaleUpperCase("el-GR")`, ποτέ σκέτο
`toUpperCase()`: το δεύτερο κρατά τον τόνο και βγάζει «ΠΈΜ» αντί «ΠΕΜ». Το ίδιο
ισχύει για το `text-transform: uppercase` στο CSS — δουλεύει σωστά μόνο επειδή
το `<html>` δηλώνει `lang="el"`.

**Ώρες αγώνων.** Η πηγή γράφει ώρα Ελλάδας. Αποθηκεύεται UTC μέσω
`ZoneInfo("Europe/Athens")`, όχι με σταθερό +2: η Ελλάδα είναι +3 από τα τέλη
Μαρτίου ως τα τέλη Οκτωβρίου, που πιάνει τις πρώτες και τις τελευταίες
αγωνιστικές κάθε σεζόν. Γι' αυτό το `tzdata` είναι dependency — τα Windows δεν
κουβαλούν tz database και το `zoneinfo` σκάει εκεί.

## Επόμενο βήμα

Auth και editor dashboard (φάση 3-4). Οι πίνακες `users`, `user_associations`
και `audit_log` υπάρχουν· endpoints δεν υπάρχουν, οπότε σήμερα κάθε διόρθωση
περνά από script.

Ο scraper είναι ένας adapter ανά οικογένεια template, όχι ένας για όλους: μια
ματιά σε πέντε sites ΕΠΣ έδειξε τέσσερα άσχετα σχήματα (βλ.
`app/scraper/sources/base.py`). Η δεύτερη ένωση θα δείξει πόσο από τον
`EpsipSource` είναι όντως κοινό.
