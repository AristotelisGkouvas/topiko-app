# Αρχιτεκτονική ανασκόπηση

Κατάσταση στις 24 Σεπτεμβρίου 2026, μετά το commit `329f465` και τις
μη-committed αλλαγές που υπήρχαν στο δίσκο εκείνη τη μέρα. Δύο βαθιές
αναγνώσεις (backend, frontend) συν συνολική επισκόπηση. Οι αναφορές
αρχείο:γραμμή ισχύουν για εκείνη τη στιγμή· αν μετακινηθεί κώδικας, ψάξε το
όνομα.

Η αξιολόγηση από «χρήστες» είναι στο `UX_REVIEW.md`. Εδώ είναι η δομή, όχι η
εμπειρία.

## Σε μία παράγραφο

Για 70 commits σε 25 μέρες (≈15k Python, 14k TypeScript, 9k CSS) η
αρχιτεκτονική είναι πάνω από τον μέσο όρο: το tenant μπαίνει από το URL και
τίποτα δεν διαβάζεται χωρίς αυτό, τα derived δεδομένα (βαθμολογία, σκορ από
γεγονότα, live status) ξαναϋπολογίζονται αντί να πληκτρολογούνται, ο scraper
έχει σωστό κόψιμο (adapters χωρίς HTTP/DB, «ποιος κερδίζει» σε pure module),
και το frontend κάνει σωστά πράγματα που σπάνια γίνονται σωστά (external
stores με hydration gating, outbox με idempotency, tokens με σκεπτικό
αντίθεσης). **Τα προβλήματα είναι επανάληψη κώδικα και έλλειψη διχτυού
ασφαλείας, όχι λάθος σχέδιο.** Μηδέν tests σε επίπεδο API, μηδέν στο
frontend, καθόλου CI/lint/typecheck config, καθόλου rate limiting, business
logic μέσα σε routers, δύο πηγές αλήθειας για το σκορ, και ένα frontend που
ξαναγράφει τα ίδια πέντε πράγματα.

---

## 1. Τι είναι ασυνήθιστα καλό (να μην χαλάσει)

- **Tenant scoping**: `api/deps.py:14-38` φέρνει την ένωση από το URL, κάθε
  query φιλτράρει με `League.association_id` (denormalized,
  `models/league.py:28-31`). Ελέγχθηκε κάθε endpoint με id/slug
  (`public.py:626`, `editor.py:172`, `events.py:113`, `predictions.py:59`,
  `mvp.py:164`, `editor.py:488`, `volunteer._own_match`, archive γραμμές
  107/161/255/314/357/398/427/485/540/606/653/685): **κανένα cross-tenant
  read**.
- **Pure services με tests**: `services/standings.py`, `live.py`,
  `match_events.py`, `notify_prefs.py`, `scraper/decisions.py` τρέχουν χωρίς
  DB και fixed clock.
- **Effective live status στην έξοδο** (`schemas/match.py:36-56`) αντί για
  αποθηκευμένο flag που παλιώνει.
- **Auth**: Argon2id + rehash (`core/security.py`), timing-safe login με dummy
  hash (`auth.py:35,123`), httpOnly/SameSite=Lax cookie, re-read χρήστη ανά
  request (`auth_deps.py:66-79`), placeholder-secret guard στο boot
  (`config.py:69-80`), κωδικοί σωματείων hashed με lockout
  (`services/volunteer.py:172-183`), audit στην ίδια συναλλαγή.
- **Scraper**: `Source`/`CatalogSource`/`PeopleSource` protocols
  (`scraper/sources/base.py`) με τεκμηριωμένη απόφαση «όχι config-driven
  engine», dataclasses χωρίς ORM (`types.py`), `plan_match` pure
  (`decisions.py`), Fetcher με robots/backoff, `ScrapeRun` + `TeamAlias` +
  `scripts/completeness.py`, adaptive cadence (`schedule.py:104-129`),
  fixtures από πραγματικές σελίδες.
- **Μοντέλο**: varchar-enums με CHECK (`models/base.py:33`), naming
  convention, `ondelete` παντού, `LeagueTeam.points_deduction`, NULL =
  «άγνωστο» στα stats. 14 γραμμικά migrations με `compare_type`.
- **Frontend**: όλες οι σελίδες server components, client μόνο ό,τι διαβάζει
  browser state ή poll-άρει (49/106 tsx). Έξι external stores
  (`favourite`, `onboarding`, `outbox`, `freshness`, `ThemeToggle`,
  `InstallCard`) με σωστό `getServerSnapshot` και `useHydrated` gating
  (`MyClub.tsx:64`, `WelcomeCard.tsx:26`). Theme inline script χωρίς flash
  (`layout.tsx:91-97`). Outbox με client_id idempotency, ordered flush,
  4xx-drop (`lib/outbox.ts`). Ένα `MatchSheet` για editor και εθελοντή μέσω
  `SheetBackend` (`MatchSheet.tsx:79-103`). Dark mode **μόνο** μέσω semantic
  tokens, μηδέν `prefers-color-scheme` σε modules. `API_INTERNAL_URL` split
  (`api.ts:44-49`). `tsc --noEmit` και `eslint` καθαρά.
- **Σχόλια που εξηγούν το γιατί** με πραγματικό σενάριο, σε όλο το codebase.
- **Docker**: ένα backend image για τρεις ρόλους, non-root, migrate ως
  ξεχωριστό service, compose που αρνείται scraper χωρίς πραγματικό
  User-Agent.

---

## 2. Backend

### 2.1 Layering: business logic σε routers

Endpoints >60 γραμμών που είναι στην ουσία services:

| Πού | Γραμμές | Τι κάνει |
|---|---|---|
| `editor.py:163-253 edit_match` | 91 | live-window gate, snapshot/diff, data_source, recompute |
| `editor.py:540-658 open_mvp_poll` | 119 | league/players/teams, replace poll, audit |
| `editor.py:259-331 edit_field` | 73 | |
| `editor.py:792-857 edit_zones` | 66 | |
| `events.py:199-271 record_event` + `_settle` + `_announce` | 73+ | ένα service που ζει σε router· ο `volunteer.py:28-35` εισάγει τα private του (`_feed`, `_load`) — **router εξαρτάται από ιδιωτικά άλλου router** |
| `public.py:614-689 get_match` | 76 | |
| `public.py:323-387 team_history` | 65 | |
| `archive.py:644-732 records` | 89 | |
| `archive.py:228-307 head_to_head` | 80 | |
| `archive.py:80-149 search_players` | 70 | |

### 2.2 Διπλασιασμός

- «Match by id μέσα στο tenant» **4 φορές**: `public.py:626-632`,
  `editor.py:172-182`, `events.py:113-133`, `predictions.py:59-72`.
- `_MATCH_LOADS` **5 φορές**: `public.py:61`, `archive.py:62`, inline
  `editor.py:143-147` και `:175-179`, `volunteer.py:200-203`.
- `_load_team` (`public.py:254`) ≈ `_team_or_404` (`archive.py:310`).
- Roster query: `volunteer.py:332-373` ≈ `public.py:394-441` (ίδιο query,
  ίδιο dedupe). `RosterPlayerOut` ορισμένο δύο φορές (`schemas/catalog.py:123`,
  `volunteer.py:323`).
- **Τέσσερα «παράθυρα γύρω από τη σέντρα»** χωρίς κοινό σημείο:
  `editor.py:47-48` (−30΄/+3h), `services/live.py:28` (3h),
  `volunteer.py:53-54` (−3h/+6h), `config.py:98-101` (scraper).
- Schemas μισά στο `app/schemas/`, μισά inline στους routers (`MatchEdit`,
  `EventIn`)· `PollOut` δύο φορές με ίδιο όνομα (`mvp.py:40`,
  `predictions.py:45`).

### 2.3 Δύο πηγές αλήθειας για το σκορ, και stale derived

- Ο editor γράφει `home_score` απευθείας (`editor.py:187-236`)· κάθε επόμενο
  γεγονός εθελοντή ξαναϋπολογίζει από το log (`events.py:382`,
  `match_events.apply_events`) και **το σβήνει**. Επιβεβαιώθηκε ζωντανά στο
  UX review: 3–4 της βάσης έγινε 0–1 με το πρώτο γκολ εθελοντή.
- `editor.edit_match:246-250` κάνει recompute βαθμολογίας **μόνο αν άγγιξε
  σκορ**. Αλλαγή μόνο status (FINISHED→AWARDED, POSTPONED σε αγώνα με σκορ,
  SCHEDULED→FINISHED με υπάρχον σκορ) αφήνει τη βαθμολογία παλιά μέχρι το
  επόμενο scrape.
- Σκορ σε SCHEDULED αγώνα δεν τον κάνει FINISHED (βλ. UX review, Ελένη #2)
  και δεν υπάρχει έλεγχος kickoff > now.
- Undo όλων των γεγονότων: `apply_events:105-111` μηδενίζει σκορ αλλά αφήνει
  `status=FINISHED` (`status_from_events` επιστρέφει None).
- Σωστά: volunteer «Τελικό» → `_settle` → `recompute_standings`· scraper →
  `_sync_standings` (`sync.py:1116,1182`).

### 2.4 Ασφάλεια: τι λείπει

- **Rate limiting πουθενά.** `/auth/login` χωρίς brute-force προστασία.
  `/ethelontis/login` έχει lockout ανά κωδικό, που είναι ταυτόχρονα DoS σε
  σωματείο (το παραδέχεται το docstring) και δεν σταματά παράλληλη δοκιμή
  πολλών prefixes.
- **Ψηφοφορίες**: `predictions.cast_vote` και `mvp.vote` δέχονται
  οποιοδήποτε `voter_token` — unbounded inserts, vote stuffing με script.
- **CSRF**: Lax cookie + JSON body = χαμηλός κίνδυνος, αλλά χωρίς ρητή άμυνα
  (Origin check ή double-submit). CORS `allow_methods/headers=*` με
  credentials (`main.py:26-32`) εντάξει μόνο όσο τα origins είναι ρητά.
- **Revocation**: `jti` δημιουργείται (`security.py:78`) και δεν
  χρησιμοποιείται· logout = διαγραφή cookie, κλεμμένο token ισχύει 12h.
- **Argon2 σύγχρονα μέσα στον event loop**: `services/volunteer.py:136,176`
  (το `auth.py:124` κάνει σωστά `to_thread`).
- `audit._client_ip` (`audit.py:83-86`) εμπιστεύεται X-Forwarded-For χωρίς
  να ξέρει αν υπάρχει proxy.
- `push.read_prefs/write_prefs` (`push.py:167-232`): η ταυτότητα είναι το
  `endpoint` string. Αποδεκτό, να δηλωθεί.
- `/docs` ανοιχτό σε production, χωρίς security headers ή TrustedHost.

### 2.5 Μοντέλο δεδομένων: constraints που λείπουν

- Partial unique «μία `is_current` σεζόν ανά association».
- Unique ταυτότητα αγώνα `(league_id, matchday, home_team_id, away_team_id)`
  — dedupe μόνο in-memory (`sync.py:1150-1160`).
- `ix_matches_live` σε boolean: σχεδόν άχρηστο.
- `PlayerStat.team_id` χωρίς index (roster queries).
- N+1: δεν βρέθηκε — selectinload παντού, batch lookups στο archive
  (`archive.py:119`).

### 2.6 Scraper

- `Syncer` 800 γραμμές (`sync.py:383-1182`), `_sync_people` 101, `sync()` 119.
- **Ολόκληρη η σεζόν σε μία συναλλαγή** που καλύπτει ~60 HTTP requests με
  delays (`sync.py:400-517`). Ένας editor που PATCH-άρει αγώνα ήδη
  ενημερωμένο στο τρέχον run μπλοκάρει στο row lock μέχρι το commit.
- epsip-ισμοί στον γενικό Syncer: `labels.describe_league` (`sync.py:832`)
  γραμμένο πάνω στους 237 τίτλους του epsip, `_choose_periods`/`period_id`.
  Για δεύτερη ΕΠΣ ανήκουν στον adapter ή σε per-source config.
- Καμία ειδοποίηση πέρα από logs· το `Meta.last_scraped_at` δεν λέει αν το
  run ήταν FAILED.

### 2.7 Εργαλεία

- Tests: 21 αρχεία, όλα unit σε pure functions/parsers. **Κανένα API ή DB
  test** (κανένα conftest, `AsyncClient`, testcontainers). Ό,τι ζει σε
  routers δεν ελέγχεται.
- Typing πλήρες αλλά χωρίς mypy/pyright config. `# noqa` υποδηλώνει ruff
  αλλά δεν υπάρχει `pyproject`/`ruff.toml`/pre-commit/CI.
- Το API δεν ρυθμίζει logging (`main.py`), ούτε request id· `/health` δεν
  ελέγχει DB. `debug` ανεκμετάλλευτο.

---

## 3. Frontend

### 3.1 Routing και data fetching

- Ελληνικά slugs και query params, συνεπή. **Δύο legacy routes**
  `apotelesmata/` και `programma/` που δεν λινκάρονται από πουθενά εκτός
  μεταξύ τους (`programma/page.tsx:72`) και κουβαλούν παράλληλη οικογένεια
  components: `MatchGrid`, `MatchCard`, `LeagueTabs`, `MatchdayPicker`.
- `force-dynamic` σε 24/28 σελίδες + 4 OG routes. Λάθος ως default:
  `vathmologia`, `rekor`, `san-simera`, `sxetika` δεν έχουν λόγο πέρα από το
  cookie `ps_league` (`leagues.ts:46-54`).
- Το layout (`layout.tsx:69-80`) καλεί `getMeta` + `resolveLeague`, κάθε
  σελίδα ξανακαλεί `resolveLeague` → 2× `listSeasons` + 2× `listLeagues`
  ανά request, σωσμένα μόνο από το request memoization του Next (σιωπηλά).
- `findStanding` (`club.ts:36-38`): 17 παράλληλα standings calls ανά σελίδα
  σωματείου. Ανήκει στο backend.
- **Κανένα `loading.tsx`** σε όλο το app, ενώ το `TableSkeleton`
  (`States.tsx:32`) υπάρχει και δεν χρησιμοποιείται.

### 3.2 Διπλή λογική

- `page.tsx:113-119` και `:128-133` ρεντάρουν το `<Numbers>` **δύο φορές στο
  DOM** (narrow/wide)· ίδιο στο `vathmologia/page.tsx:90-107` (`<Rail>` ×2).
  Διπλό markup, **διπλά ids** (`standings-heading` ×2 → invalid HTML).
- Λίστα αγώνων σε **πέντε** μορφές: `MatchRow`, `MatchCard`, `FixtureRow`
  (`MatchCard.tsx:153`), `MatchSheet.pickRow`, `MatchEditor.MatchRow` (ίδιο
  όνομα με το component).
- Επιλογή κατηγορίας σε **τέσσερα** components: `LeagueChips`, `LeagueTabs`,
  `LeagueRail`, `LeaguePicker`.
- Session check: `EditorDashboard.tsx:47` με SWR, `Desk.tsx:34-49` με
  `useEffect`+`useState`.
- Feed στο MatchSheet κρατιέται δύο φορές (SWR `:208-217` + `useState` `:172`).
- Πληθυντικός `ψήφος/ψήφοι` τρεις φορές (`Ballot:139`, `Prediction:103`,
  `LiveMatches:46`).

### 3.3 Types και API client

- `types.ts` χειρόγραφο· το σχόλιο `types.ts:1-3` λέει ότι «ο compiler πιάνει
  το drift» — δεν το πιάνει. Drift **ήδη υπάρχει**: `RosterPlayer` δύο φορές,
  `types.ts:374` (`goals: number | null`) και `GoalSheet.tsx:8`
  (`goals: number`), και το `volunteerApi.ts:7` εισάγει τη λάθος.
- `MatchFeed` ζει σε component (`MatchTicker.tsx:36`) και το εισάγουν
  `editorApi.ts:4`, `volunteerApi.ts:5` — **lib εξαρτάται από components**.
  `Poll` στο `Prediction.tsx:11`.
- **Τέσσερις error classes** (`ApiError`, `EditorError`, `VolunteerError`,
  plain `Error` σε `mvpApi`/`notifyApi`) και **οκτώ fetch wrappers**:
  `api.ts:83`, `editorApi.ts:36`, `volunteerApi.ts:35`, συν `fetcher` σε
  `MatchTicker:70`, `LiveMatches:20`, `Prediction:44`, `MyClub:24`,
  `NotifyButton:14`.
- `${API_URL}/api/v1/${ASSOCIATION}` ως literal σε **6 client modules** —
  ακριβώς αυτό που σπάει με δεύτερη ΕΠΣ.
- Voter token ορισμένο δύο φορές (`mvpApi.ts:14-35`, `Prediction.tsx:22-42`)
  με ίδιο key.

### 3.4 Bugs από την ανάγνωση

| # | Πού | Τι |
|---|---|---|
| 1 | `MatchSheet.tsx:195` | Καλεί `editorApi.feed()` αντί `backend.feed()` στο retry → **ο εθελοντής παίρνει 401 μετά από flush** |
| 2 | `error.tsx:35-40` | Καλεί `reset()` σε κάθε mount όσο `online === true`. Το reset κάνει `setState({error:null})`, τα children ξαναπετούν, το effect ξανατρέχει → **πιθανός tight loop όταν το API είναι κάτω αλλά το κινητό online**. Να ελεγχθεί με API σβηστό. |
| 3 | `tokens.css:180-218` και `:220-252` | Το dark block **δύο φορές αυτούσιο**, stray γραμμή `:214-215` |
| 4 | `page.tsx`, `vathmologia/page.tsx` | Διπλό DOM, διπλά ids (§3.2) |
| 5 | `VenueMap.tsx:21,73` | Νέο `located` array κάθε render + `[located]` dep → ο χάρτης γκρεμίζεται/ξαναχτίζεται σε κάθε re-render του γονέα. Τα σχόλια `favourite.ts:111`, `LeaguePicker.tsx:14`, `freshness.ts:15` υποθέτουν React Compiler, που **δεν είναι ενεργός** (`next.config.ts` χωρίς `reactCompiler`) |
| 6 | `SearchModal`, `GoalSheet` | `role=dialog` χωρίς focus trap |

### 3.5 Styling

- Tokens εξαιρετικά (§1). Αλλά καμία design-system layer από πάνω: **19
  πανομοιότυπα `.card`** blocks, **13 `.page`** σε δύο templates (720px flex
  vs full-bleed `margin: -18px -16px 0` hack που αναιρεί το padding του
  layout). Κανένα `composes`.
- **1.980 `px` vs 3 `rem`**. Κλίμακα γραμματοσειράς = 12 literals (11.5px
  ×53, 13px ×49, 12.5px ×34…). Ο χρήστης που μεγαλώνει τα γράμματα στο κινητό
  δεν βλέπει διαφορά (UX review, Λάμπρος).
- Breakpoints: 860 ×10, 1040 ×6, και 7 ακόμα τυχαίες τιμές.
- 36 hardcoded hex σε modules (`kalosorisma` 8× `#fff`).

### 3.6 PWA, offline, live

- `sw.js` network-first μόνο για navigations, ποτέ API — σωστή αρχή. Κενό:
  δεν cache-άρει `_next/static/*`, οπότε offline η HTML γυρίζει από cache
  αλλά το hydration εξαρτάται από τον HTTP cache του browser. Το
  `/diaxeirisi` στο SHELL (`sw.js:18`) περιττό.
- Polling: 20s (`LiveMatches:18`, `LiveStandings:30`), 15s ticker
  (`MatchTicker:90`), sheet 15s + flush 20s. Χωρίς `SWRConfig`, κάθε tab
  poll-άρει ανεξάρτητα. Για λίγες εκατοντάδες αναγνώστες SSE δεν αξίζει· ένα
  `Cache-Control: s-maxage=10` στο `/matches/live` απορροφά τα πάντα.
- OG: fonts cached ανά process (`og.tsx:12`), assets μπαίνουν στο standalone.
  `revalidate: 300` θα ήταν φθηνότερο για `vathmologia`.

### 3.7 Εργαλεία

- **Tests: μηδέν.** Ούτε CI, ούτε husky.
- A11y πάνω από τον μέσο όρο (skip link, `<details>` menus, `srOnly`
  caption, `aria-current`/`aria-pressed`)· λείπουν focus trap και τα διπλά ids.

---

## 4. Λίστα εργασιών

Με σειρά αξίας προς κόστος. Κάθε γραμμή είναι ένα PR.

### Τώρα (ώρες η καθεμία)

- [ ] `MatchSheet.tsx:195` → `backend.feed` (bug εθελοντή).
- [ ] `error.tsx:35-40`: reset μόνο σε μετάβαση offline→online, όχι στο mount. Δοκιμή με API σβηστό.
- [ ] Σβήσε το διπλό dark block `tokens.css:220-252`.
- [ ] `services/volunteer.py:136,176`: `asyncio.to_thread` για Argon2.
- [ ] `editor.py:246`: recompute βαθμολογίας σε **κάθε** edit που αγγίζει status ή σκορ. Σκορ σε SCHEDULED → FINISHED. 400 αν kickoff > now.
- [ ] Ορισμός «ποιος κερδίζει όταν υπάρχουν γεγονότα»: το σκορ του editor είτε γίνεται γεγονός-υπόλοιπο είτε απορρίπτεται με μήνυμα. Undo όλων → status πίσω σε LIVE/SCHEDULED.
- [ ] Rate limiting (slowapi ή Nginx) σε `/auth/login`, `/ethelontis/login`, `prognostiko`, `mvp/vote`. IP throttle στις ψήφους.
- [ ] `api/lookups.py`: `match_in(association, id)`, `team_in(...)`, `MATCH_LOADS`. Αντικαθιστά 4+5+2 αντίγραφα.
- [ ] `MatchFeed`, `RosterPlayer`, `Poll` → `types.ts`. Ένας `voterToken()`. Σβήσε το `RosterPlayer` του `GoalSheet.tsx:8`.
- [ ] Σβήσε `apotelesmata/`, `programma/`, `MatchGrid`, `LeagueTabs`, `MatchdayPicker` (ή redirect σε `/agones`).
- [ ] Ένα `<Numbers>`/`<Rail>` render με CSS `order`/grid areas αντί για διπλό DOM. Φεύγουν τα διπλά ids.
- [ ] `loading.tsx` σε `agones`, `vathmologia`, `somateia/[slug]` με το υπάρχον `TableSkeleton`.
- [ ] `VenueMap.tsx:21`: `useMemo` στο `located`, ή ενεργοποίηση React Compiler.
- [ ] Focus trap σε `SearchModal` και `GoalSheet`.
- [ ] `force-dynamic` μόνο όπου χρειάζεται· `revalidate: 300` στα OG των στατικών σελίδων.

### Πριν τη δεύτερη ΕΠΣ (μέρες)

- [ ] **Integration test harness**: Postgres σε container (testcontainers ή compose), `httpx.AsyncClient`, conftest με seed. Πρώτο test: παραμετρικό «κάθε route με id άλλου tenant → 404». Μετά: auth gates, `edit_match`, volunteer window, recompute wiring.
- [ ] Μετακίνηση `record_event`/`_settle`/`_announce` σε `services/events.py`. Ο `volunteer.py` να μην εισάγει privates.
- [ ] Σπάσιμο του `Syncer`: `labels`/periods στον adapter (ή per-source config), commit ανά league ώστε να μη μένει ανοιχτή συναλλαγή για λεπτά.
- [ ] Constraints: partial unique `seasons(association_id) WHERE is_current`, unique `matches(league_id, matchday, home_team_id, away_team_id)`, index `player_stats(team_id)`. Σβήσε `ix_matches_live`.
- [ ] Ενοποίηση των τεσσάρων «windows» σε ένα module με ονομασμένες σταθερές.
- [ ] Schemas όλα στο `app/schemas/`, ένα `PollOut`.
- [ ] `findStanding` (17 calls) → ένα endpoint `teams/{slug}` που επιστρέφει και τη θέση.
- [ ] Frontend types από OpenAPI: `openapi-typescript` από `/openapi.json`, generated σε CI, το `types.ts` γίνεται re-export.
- [ ] Ένας `apiFetch(path, {credentials?})` και ένας `ApiError` για client και server. Οι 8 wrappers και οι 4 error classes φεύγουν.
- [ ] Tenant από request: middleware → header → `scoped()`. Τα 6 literal `${API_URL}/api/v1/${ASSOCIATION}` περνούν από το ίδιο helper. (Το σχόλιο στο `api.ts:52-60` ήδη λέει ότι εκεί αλλάζει.)
- [ ] CSS primitives: `card`, `chip`, `page` ως shared modules με `composes`. Δύο breakpoint tokens. Αφαίρεση του full-bleed hack.
- [ ] Vitest για `format.ts`, `leagues.resolveMatchday`, `outbox.flush`, `greek.fold`. Playwright smoke σε 5 routes.
- [ ] GitHub Actions: typecheck, lint, pytest, vitest. Pre-commit με ruff.
- [ ] Ops: endpoint/σελίδα για `scrape_runs` (status, warnings)· `Meta` να εκθέτει αν το τελευταίο run απέτυχε· `/health` να ελέγχει DB.
- [ ] `sw.js`: cache `_next/static/*`, βγάλε το `/diaxeirisi` από το SHELL.

### Κάποτε

- [ ] ruff + mypy config στο `pyproject.toml`.
- [ ] Token revocation (jti denylist) ή μικρότερο TTL με refresh.
- [ ] Origin check ή double-submit CSRF στα cookie-auth POST.
- [ ] Security headers, TrustedHost, `/docs` κλειστό σε production.
- [ ] Request id + structured logging στο API.
- [ ] `rem` type scale (μαζί με τα a11y του UX review).
- [ ] `SWRConfig` global + `BroadcastChannel` για κοινό poll μεταξύ tabs. SSE μόνο αν φτάσεις >1k ταυτόχρονους· ως τότε `s-maxage=10` στο `/matches/live`.
- [ ] Ενεργοποίηση React Compiler (τα σχόλια ήδη το υποθέτουν).
- [ ] Ένας πληθυντικός helper (`plural(n, "ψήφος", "ψήφοι")`).
