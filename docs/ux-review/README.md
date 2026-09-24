# Kit αξιολόγησης από «χρήστες»

Ό,τι χρειάζεται για να ξανατρέξουν οι 10 agents-χρήστες του `UX_REVIEW.md`.
Τα ευρήματα είναι εκεί· εδώ είναι μόνο το πώς.

## Αρχεία

| Αρχείο | Τι |
|---|---|
| `BRIEF.md` | Οι κοινές οδηγίες που διαβάζει κάθε agent πρώτα: URLs, δεδομένα, εργαλεία, λογαριασμοί δοκιμής, μορφή αναφοράς |
| `browse.py` | Headless browser (Playwright): screenshot, κλικ, φόρμες, κείμενο σελίδας, console errors, --dark, --desktop, --slow3g |
| `review.env` | Env του `docker compose` για το περιβάλλον δοκιμής (θύρες 3002/8001/5433, development, dummy SECRET_KEY) |

Οι λογαριασμοί και οι κωδικοί εθελοντή είναι στο untracked
`credentials.local` (ταιριάζει στο `*.local` του .gitignore) και υπάρχουν
**μόνο στην τοπική βάση `pamesentra-review`**. Αν λείπει ή σβηστεί ο όγκος,
φτιάξε νέους (βλ. παρακάτω) και γράψ' τους εκεί.

## Περιβάλλον δοκιμής

Χρειάζεται Docker και δίκτυο. Το build με `docker compose build` απέτυχε στο
DNS του buildkit· δουλεύει με `--network=host`:

```bash
cd <repo>
docker build --network=host -t pamesentra-backend ./backend
docker build --network=host \
  --build-arg NEXT_PUBLIC_API_URL=http://127.0.0.1:8001 \
  --build-arg NEXT_PUBLIC_ASSOCIATION=epsip-ipeirou \
  --build-arg NEXT_PUBLIC_SITE_URL=http://127.0.0.1:3002 \
  -t pamesentra-frontend ./frontend
docker compose -p pamesentra-review --env-file docs/ux-review/review.env \
  up -d --no-build db migrate api web
docker compose -p pamesentra-review --env-file docs/ux-review/review.env \
  exec -T api python -m scripts.seed
```

Λογαριασμοί και κωδικοί εθελοντή:

```bash
# editor με δικαίωμα live· τυπώνει τον κωδικό μία φορά
docker compose -p pamesentra-review --env-file docs/ux-review/review.env exec -T api \
  python -m scripts.create_user --email editor@review.local --name "Γραμματεία ΕΠΣ" \
  --role editor --association epsip-ipeirou --live --generate-password

# κωδικός εθελοντή για ένα σωματείο (μετά από login ως editor)
curl -s -c jar -H 'Content-Type: application/json' \
  -d '{"email":"editor@review.local","password":"…"}' http://127.0.0.1:8001/api/v1/auth/login
curl -s -b jar -H 'Content-Type: application/json' \
  -d '{"team_slug":"konitsas-fc","label":"Εθελοντής δοκιμής"}' \
  http://127.0.0.1:8001/api/v1/epsip-ipeirou/editor/club-codes
```

Playwright για το `browse.py`:

```bash
python3 -m venv .pw && .pw/bin/pip install playwright && .pw/bin/playwright install chromium
.pw/bin/python browse.py http://127.0.0.1:3002/ home.png --text
```

Σταμάτημα και καθάρισμα (σβήνει και τη βάση δοκιμής):

```bash
docker compose -p pamesentra-review --env-file docs/ux-review/review.env down -v
```

## Πώς τρέχουν

Κάθε agent παίρνει: «Διάβασε ΠΡΩΤΑ το BRIEF.md και ακολούθησέ το. Το prefix
αρχείων σου είναι pN_ και το state σου pN-state.json.» και μετά το προφίλ
του. Τρέχουν παράλληλα, ανεξάρτητα. Πριν ξεκινήσουν, έλεγξε ποιος αγώνας
είναι live (`/api/v1/epsip-ipeirou/matches/live`) — το seed βάζει δύο live
τη στιγμή που τρέχει, και οι δοκιμές των εθελοντών τούς αλλάζουν.

Στην πρώτη εκτέλεση οι 4, 7, 8, 10 διακόπηκαν από όριο χρήσης. Ξεκίνα από
αυτούς.

## Τα δέκα προφίλ

### 1. Γιώργος, 52, γονιός — κινητό, χαμηλή εξοικείωση
Από τα Γιάννενα, ο γιος του παίζει στον Α.Ο. Ζίτσας. Μόνο Android, μικρά
γράμματα τον δυσκολεύουν, δεν ξέρει τι είναι PWA. Θέλει: πότε/πού παίζει η
Ζίτσα, οδηγίες για το γήπεδο, θέση στη βαθμολογία, live σκορ στο γήπεδο,
κοινοποίηση στο Viber. Δοκιμάζει το onboarding πατώντας ό,τι φαίνεται
μεγάλο, και το «Όχι τώρα». Προσέχει μεγέθη γραμμάτων/κουμπιών,
συντομογραφίες, την κάτω μπάρα.

### 2. Νίκος, 22, παίκτης — iPhone, dark mode, social
Επιθετικός του Α.Ο. Λούρου. Θέλει: τον εαυτό του (/paiktes, /skorer), MVP
(/mvp, ροή ψήφου με curl), κοινοποίηση σκορ σε story (ShareButton, OG
εικόνες με Read), dark mode σε 5-6 σελίδες (αντίθεση, κουτιά που «καίνε»),
/san-simera, /rekor. Ανυπόμονος: >3 πατήματα = βαρετό. Κρίνει αν το site έχει
«ζωή».

### 3. Θανάσης, 58, πρόεδρος σωματείου — κινητό + laptop, Viber
Α.Ο. Κόνιτσας. Ποινές, ανακοινώσεις, πρόγραμμα, βαθμολογία, Viber group.
Θέλει «την ομάδα μου» παντού, αν θυμάται την κατηγορία (cookie ps_league),
ποινές χωρίς δεδομένα, σελίδα σωματείου σε desktop, /sygkrisi, /kontra.
Θέλει να διορθώσει λάθος και να βρει Σχετικά/Επικοινωνία. Κρίνει αν το
desktop αξιοποιεί το πλάτος.

### 4. Μαρία, 35, εθελόντρια στον πάγκο — `/ethelontis`
Έφορος, κινητό στο χέρι, ήλιος, κρύο, κακό σήμα. Κωδικός σωματείου με τόνο
στο κεφαλαίο: δοκιμάζει χωρίς τόνο, πεζά, λατινικά (και διαβάζει τον κώδικα
club codes). Καταγράφει live: γκολ δικό/αντιπάλου, λάθος γκολ και αναίρεση
(μέσα και έξω από τα 60"), σκόρερ από ρόστερ, ημίχρονο, τελικό (τελευταίο).
Διπλό tap. Μεγέθη κουμπιών, αντίθεση στον ήλιο, πατήματα ανά γκολ, λεπτό,
«Χωρίς σήμα · Χ σε αναμονή» (outbox.ts, Desk.tsx, --slow3g). Τι βλέπει ο
κόσμος στο /agones/<id>. Logout/relogin, καταγραφή σε αγώνα άλλης ομάδας
μέσω curl. Έμφαση: τι θα την έκανε να παρατήσει στο 30ό λεπτό.

### 5. Ελένη, 44, γραμματεία ΕΠΣ — `/diaxeirisi`, Windows laptop
Κυριακή με έξι τηλέφωνα, Δευτέρα διορθώσεις. Τελικό σκορ σε αγώνα χωρίς
σκορ, διόρθωση λάθους εθελοντή (ποιος; AuditList), αναβολή με αιτιολογία και
νέα ώρα/γήπεδο, διόρθωση γηπέδου + συντεταγμένες, κωδικός εθελοντή και
ακύρωση, MVP, εύρεση αγώνα από τους 90, λήξη session στη μέση. Κρίνει design
system, επιβεβαιώσεις, ελληνικά μηνύματα σφάλματος (λάθος input), δουλειά
μόνο με πληκτρολόγιο.

### 6. Κώστας, 39, αθλητικός συντάκτης — desktop, Κυριακή βράδυ
Γράφει σε 20 λεπτά «όλα τα αποτελέσματα» για όλες τις κατηγορίες με σκόρερ,
και Δευτέρα τη βαθμολογία. Μία οθόνη με όλα, κλικ για αλλαγή
αγωνιστικής/κατηγορίας, αντιγραφή κειμένου, σκόρερ αγώνα/κατηγορίας, ρεκόρ,
Σαν σήμερα, αναζήτηση (χωρίς τόνους, greeklish, μερικό όνομα, «/»),
αξιοπιστία (πότε/από ποιον), permalinks, ημερολόγιο/feed/RSS. Σελίδα αγώνα
live και παλιού σε desktop.

### 7. Κύριος Λάμπρος, 71, χαμηλή όραση — προσβασιμότητα
Παλιός ποδοσφαιριστής της Πρέβεζας, μεγέθυνση 200%, TalkBack, τρέμουλο.
Τεχνικός έλεγχος με φωνή persona: touch targets <44px, μικρότερα font sizes,
WCAG contrast από tokens.css (light/dark), 200% zoom και 320px (ξεχειλίσματα,
πίνακες), semantics (landmarks, h1→h2, aria-label σε icon κουμπιά,
aria-hidden μονογράμματα, table th/scope/caption/abbr, lang, focus-visible,
skip link, aria-live για το σκορ, reduced-motion), Tab σειρά και ορατό focus.
Τι τον εμποδίζει να διαβάσει το σκορ της Πρέβεζας και τη θέση της.

### 8. Βαγγέλης, 30, Μέτσοβο — παλιό Android, 3G, 2GB/μήνα
Οπαδός της Α.Ε. Μετσόβου. Βάρος κάθε σελίδας (JS/CSS/fonts/images, πρώτη
και δεύτερη επίσκεψη, /gipeda με Leaflet), κόστος polling ανά μήνα, --slow3g
(πότε φαίνεται το πρώτο σκορ, skeleton ή λευκό), offline (OfflineBar, reload,
service worker cache, manifest, InstallCard), fonts (από πού, FOUT), OG
εικόνες, /eidopoiiseis με VAPID κενό, χάρτης χωρίς συντεταγμένες. Πίνακας
μετρήσεων.

### 9. Κατερίνα, 28, από την Άρτα — πρώτη επίσκεψη από Facebook
Άλλη ΕΠΣ, ο ξάδερφος στη Φιλιππιάδα, της ήρθε link αγώνα. Πρώτη εντύπωση:
og tags (τίτλος, περιγραφή, εικόνα), κατανόηση σε 5" (τι, ποια ένωση, πότε),
αναζήτηση «Άρτα», Σχετικά/Επικοινωνία/GDPR (cookies, localStorage,
voter_token), το «Περισσότερα» και τα ονόματά του, follow μιας ομάδας και τι
αλλάζει στο επόμενο άνοιγμα, 404 σελίδες, desktop αρχική. Ως γυναίκα από
μη-ποδοσφαιρικό χώρο: καλοδεχούμενη ή «κλαμπ ανδρών»;

### 10. Δημήτρης, 46, προπονητής — tablet, ανάλυση αντιπάλου
Α.Ε. Δωδώνης, UEFA B, αναλυτικός. Επόμενος αντίπαλος (σελίδα σωματείου:
πρόγραμμα, φόρμα, εντός/εκτός), /kontra και /sygkrisi (τι λείπει: γκολ ανά
ημίχρονο, έδρα, σκόρερ, λεπτά), βαθμολογία (εντός/εκτός, +/-, κριτήριο
ισοβαθμίας στον backend και αν εξηγείται), LiveStandings, Prediction σε
μελλοντικό αγώνα, SeasonPicker/ιστορικό, ρόστερ και ποινές αντιπάλου,
εκτύπωση/εξαγωγή (@media print). Έλεγχος ακρίβειας: επανυπολογισμός
βαθμολογίας από τα αποτελέσματα του API.
