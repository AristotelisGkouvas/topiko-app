# Αρχιτεκτονική ανασκόπηση

Αρχική ανάγνωση στις 24 Σεπτεμβρίου 2026 (commit `329f465`). Ενημερώθηκε στις
25 Σεπτεμβρίου: ό,τι διορθώθηκε από τη λίστα αφαιρέθηκε, και εδώ μένει μόνο ό,τι
εκκρεμεί. Οι αναφορές αρχείο:γραμμή μετακινούνται· αν δεν ταιριάζουν, ψάξε το
όνομα.

## Σε μία παράγραφο

Το σχέδιο ήταν σωστό από την αρχή (§1). Το δίχτυ ασφαλείας που έλειπε υπάρχει
πλέον: integration tests πάνω σε Postgres, Vitest, Playwright, ruff, mypy και
CI με έλεγχο συμβολαίου API↔frontend. Υπάρχουν επίσης rate limiting, ανάκληση
session, έλεγχος Origin και security headers. Όσα μένουν είναι κυρίως
επανάληψη κώδικα στο frontend, λίγη business logic ακόμα μέσα σε routers και
δύο θέματα που αφορούν τη δεύτερη ΕΠΣ.

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

## 2. Τι μένει

### Backend

- **Business logic σε routers.** Endpoints πάνω από 60 γραμμές που είναι στην
  ουσία services: `editor.edit_match`, `editor.open_mvp_poll`,
  `editor.edit_field`, `editor.edit_zones`, `public.get_match`,
  `public.team_history`, `archive.records`, `archive.head_to_head`,
  `archive.search_players`. Τα γεγονότα βγήκαν ήδη σε `services/events.py`·
  τα υπόλοιπα με τον ίδιο τρόπο, ξεκινώντας από το `edit_match`.
- **Roster query δύο φορές:** `volunteer.roster` ≈ `public` (ίδιο query, ίδιο
  dedupe). Να γίνει μία συνάρτηση στο `services/`.
- **`Syncer` ακόμα ~800 γραμμές.** Το commit γίνεται πλέον ανά κατηγορία και ο
  τίτλος διοργάνωσης διαβάζεται από τον adapter (`TitleReader`). Μένει το
  σπάσιμο της κλάσης: people, standings και announcements σε δικά τους modules.
- **Ξεχασμένοι LIVE αγώνες.** Η βαθμολογία τους μετράει πλέον με το
  «effective» status, αλλά η βάση κρατά `status=LIVE` ώσπου να περάσει ο
  scraper. Ένα βήμα στο `scraper/schedule.py` που θα τους κλείνει (FINISHED ή
  SCHEDULED) θα έκανε και τη βάση ίδια με αυτό που βλέπει ο αναγνώστης.
- **mypy χωρίς `strict`.** Τώρα είναι καθαρό με `check_untyped_defs`. Επόμενο
  βήμα το `disallow_untyped_defs`, ένα module τη φορά.
- `push.read_prefs/write_prefs`: η ταυτότητα είναι το `endpoint` string.
  Αποδεκτό, αλλά να αναφέρεται στην τεκμηρίωση.

### Frontend

- **Λίστα αγώνων σε πέντε μορφές:** `MatchRow`, `MatchCard`, `FixtureRow`,
  `MatchSheet.pickRow`, `MatchEditor.MatchRow`.
- **Επιλογή κατηγορίας σε τέσσερα components:** `LeagueChips`, `LeagueTabs`,
  `LeagueRail`, `LeaguePicker`.
- **Session check με δύο τρόπους:** `EditorDashboard` με SWR, `Desk` με
  `useEffect`/`useState`. Το feed στο `MatchSheet` κρατιέται και σε SWR και σε
  `useState`.
- **Tenant στο SSR των client components.** Ο server διαβάζει την ΕΠΣ από το
  header του `proxy.ts` και ο browser από το `<html data-association>`. Στο
  server render όμως ενός client component, το `apiUrl()` πέφτει στο
  `NEXT_PUBLIC_ASSOCIATION`. Με μία ΕΠΣ δεν φαίνεται· με δεύτερη σε κοινό
  deployment θα έβγαζε hydration mismatch στα links (π.χ. `CalendarLink`).
  Λύση: tenant σε React context από το layout.
- **Το layout καλεί `resolveLeague` και κάθε σελίδα το ξανακαλεί.** Σώζεται
  μόνο από το request memoization του Next.
- **Breakpoints.** Τα 860px και 1040px είναι το συμβόλαιο (`tokens.css`). Μένουν
  ακόμα τρία ιδιαίτερα `min-width`, όλα σε δικά τους components: 560
  (`somateia`), 640 (`gipeda`, `GoalSheet`), 720 (`LiveMatches`).
- **Full-bleed.** Το `margin` που αναιρεί το padding του layout διαβάζει πλέον
  τα tokens `--layout-gutter-*`, οπότε δεν μπορεί να ξεφύγει. Εξακολουθεί
  όμως να είναι αρνητικό margin. Η καθαρή λύση είναι το layout να μην έχει
  padding και κάθε σελίδα να παίρνει `.page` ή `.bleed`.
- **Hardcoded χρώματα:** 36 hex σε modules (το `kalosorisma` έχει 8× `#fff`).
- **`force-dynamic`:** δεν έχει νόημα να αφαιρεθεί. Το tenant είναι ανά
  request, άρα κάθε σελίδα είναι έτσι κι αλλιώς dynamic.
