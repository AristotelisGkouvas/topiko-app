# assets/

Δεν σερβίρονται· διαβάζονται κατά τη δημιουργία των OpenGraph εικόνων.

**NotoSans-Regular.ttf, NotoSans-Bold.ttf** — Noto Sans (Latin/Greek/Cyrillic),
SIL Open Font License 1.1, © The Noto Project Authors.
<https://github.com/notofonts/latin-greek-cyrillic>

Είναι στο repo και δεν έρχονται από το `next/font` για δύο λόγους: το Satori,
που παράγει τις εικόνες, δεν δέχεται woff2 — και ό,τι κατεβάζει το
`next/font/google` είναι woff2 σε κρυφό cache. Και χωρίς ρητή γραμματοσειρά με
ελληνικά γλυφά, κάθε ελληνικό γράμμα στην εικόνα βγαίνει κουτάκι.
