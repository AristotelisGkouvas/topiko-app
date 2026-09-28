import type { Metadata } from "next";
import Link from "next/link";

import { ApiLink } from "@/components/ApiLink";
import { PageHeader } from "@/components/PageHeader";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Σχετικά",
  description:
    "Τι είναι το Πάμε Σέντρα, τι καλύπτει, από πού έρχονται τα δεδομένα και τι αποθηκεύεται.",
};

/** Set at deploy time. Left out of the code on purpose: an address typed here
 *  would be a guess, and a wrong one is worse than none. */
const CONTACT = process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim() || null;

/** Who, what, where from, and what is kept — the page first-time visitors went
 *  looking for and did not find. */
export default function AboutPage() {
  return (
    <>
      <PageHeader column="narrow" title="Σχετικά" />

      <div className={styles.page}>
        {/* Who it is for comes first: this is where clubs and journalists land
            from a link, and the privacy detail, most of the page before, now
            opens on request. Nothing was cut. */}
        <p className={styles.lead}>
          Αποτελέσματα, βαθμολογίες, πρόγραμμα και live σκορ του τοπικού
          ποδοσφαίρου της <strong>ΕΠΣ Ηπείρου</strong>. Ανεξάρτητη σελίδα:
          επίσημο είναι ό,τι δημοσιεύει η ίδια η ένωση. Άλλες ενώσεις θα
          προστεθούν αργότερα.
        </p>

        <div className={styles.audiences}>
          <section className={styles.audience} aria-labelledby="fans">
            <h2 id="fans" className={styles.audienceTitle}>Για φιλάθλους</h2>
            <p>
              Ακολούθησε την ομάδα σου και θα τη βλέπεις πρώτη στην αρχική, με
              ειδοποίηση σε κάθε γκολ της.
            </p>
            <Link href="/somateia" className={styles.audienceLink}>
              Βρες την ομάδα σου ›
            </Link>
          </section>
          <section className={styles.audience} aria-labelledby="clubs">
            <h2 id="clubs" className={styles.audienceTitle}>Για σωματεία</h2>
            <p>
              Δώσε το σκορ live από τον πάγκο, με τον κωδικό που σου έδωσε η
              ένωση.
            </p>
            <Link href="/ethelontis" className={styles.audienceLink}>
              Live από το γήπεδο ›
            </Link>
          </section>
          <section className={styles.audience} aria-labelledby="press">
            <h2 id="press" className={styles.audienceTitle}>Για συντάκτες</h2>
            <p>
              Τα τελικά αποτελέσματα όλων των κατηγοριών ως{" "}
              <ApiLink path="/apotelesmata.rss">RSS</ApiLink>, κάθε κατηγορία
              ως ημερολόγιο από τη σελίδα «Αγώνες».
            </p>
            <Link href="/embed/vathmologia" className={styles.audienceLink}>
              Βαθμολογία για το site σου ›
            </Link>
          </section>
        </div>

        <section className={styles.card} aria-labelledby="source">
          <h2 id="source" className={styles.heading}>
            Από πού έρχονται τα δεδομένα
          </h2>
          <ul className={styles.list}>
            <li>
              <strong>Από την ένωση.</strong> Πρόγραμμα, τελικά αποτελέσματα,
              βαθμολογίες, ποινές και ανακοινώσεις διαβάζονται αυτόματα από τη
              σελίδα της ένωσης, αρκετές φορές την ημέρα.
            </li>
            <li>
              <strong>Από το γήπεδο.</strong> Τα live σκορ και τα γεγονότα τα
              καταχωρούν εθελοντές των σωματείων με κωδικό που δίνει η ένωση,
              ή η γραμματεία της ένωσης. Μέχρι να επιβεβαιωθούν, η σελίδα του
              αγώνα το λέει ρητά.
            </li>
            <li>
              Κάτω από κάθε λίστα φαίνεται πότε ενημερώθηκε τελευταία φορά.
            </li>
          </ul>
        </section>

        <section className={styles.card} aria-labelledby="privacy">
          <h2 id="privacy" className={styles.heading}>
            Απόρρητο
          </h2>
          <p>
            Δεν υπάρχουν λογαριασμοί για αναγνώστες ούτε εργαλεία
            παρακολούθησης τρίτων. Τα στατιστικά είναι ανώνυμα και χωρίς
            cookies.
          </p>
          <details className={styles.more}>
            <summary className={styles.moreSummary}>Δες τι κρατάμε</summary>
            <p>
              Ό,τι θυμάται η σελίδα μένει <strong>στον δικό σου browser</strong>:
            </p>
            <ul className={styles.list}>
              <li>η ομάδα ή οι ομάδες που ακολουθείς·</li>
              <li>το θέμα εμφάνισης (φωτεινό/σκοτεινό)·</li>
              <li>η κατηγορία που είδες τελευταία (cookie)·</li>
              <li>αν είδες ήδη το καλωσόρισμα ή είπες «Όχι τώρα» στην επιλογή ομάδας·</li>
              <li>πότε φόρτωσες κάθε σελίδα, για να σου λέει πόσο παλιά είναι χωρίς σύνδεση.</li>
            </ul>
            <p>
              Στον server φτάνουν μόνο: ένας τυχαίος αριθμός αν ψηφίσεις σε
              πρόβλεψη ή MVP (για να μη μετρηθεί η ψήφος δύο φορές), και η
              διεύθυνση ειδοποιήσεων του browser αν ενεργοποιήσεις ειδοποιήσεις.
              Κανένα από τα δύο δεν λέει ποιος είσαι. Τα σβήνεις όλα αδειάζοντας
              τα δεδομένα του site στον browser.
            </p>
            <p>
              <strong>Ανώνυμα στατιστικά, χωρίς cookies.</strong> Μετράμε ποιες
              σελίδες διαβάζονται, πόση ώρα, από πού ήρθες (π.χ. Viber, Google),
              το είδος της συσκευής και του browser, και ποια κουμπιά πατιούνται
              (κοινοποίηση, οδηγίες, αναζήτηση), μαζί με σφάλματα και ταχύτητα της
              σελίδας. Δεν κρατάμε τη διεύθυνση IP ούτε τίποτα που σε
              ταυτοποιεί: για να μη μετρηθείς δύο φορές την ίδια μέρα, κρατάμε
              έναν κρυπτογραφημένο κωδικό που αλλάζει κάθε μέρα και δεν αντιστοιχεί
              σε πρόσωπο. Αν ο browser σου στέλνει «Global Privacy Control» ή «Do
              Not Track», δεν μετράμε τίποτα.
            </p>
          </details>
        </section>

        <section className={styles.card} aria-labelledby="contact">
          <h2 id="contact" className={styles.heading}>
            Βρήκες λάθος;
          </h2>
          {CONTACT ? (
            <p>
              Γράψε μας στο{" "}
              <a
                href={`mailto:${CONTACT}?subject=${encodeURIComponent("Λάθος στο Πάμε Σέντρα")}`}
              >
                {CONTACT}
              </a>{" "}
              με τη διεύθυνση της σελίδας και τι είναι λάθος. Για σκορ αγώνα,
              το πιο γρήγορο είναι το κουμπί «Αναφορά λάθους» στη σελίδα του
              αγώνα.
            </p>
          ) : (
            <p>
              Ενημέρωσε τη γραμματεία της ένωσης, με τη διεύθυνση της σελίδας
              και τι είναι λάθος.
            </p>
          )}
        </section>
      </div>
    </>
  );
}
