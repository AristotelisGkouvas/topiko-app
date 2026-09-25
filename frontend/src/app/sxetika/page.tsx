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
        <section className={styles.card} aria-labelledby="what">
          <h2 id="what" className={styles.heading}>
            Τι είναι
          </h2>
          <p>
            Το Πάμε Σέντρα δείχνει αποτελέσματα, βαθμολογίες, πρόγραμμα και live
            σκορ του τοπικού ποδοσφαίρου. Καλύπτει προς το παρόν την{" "}
            <strong>ΕΠΣ Ηπείρου</strong>· άλλες ενώσεις θα προστεθούν αργότερα.
          </p>
          <p>
            Δεν είναι επίσημη σελίδα της ένωσης. Επίσημο είναι ό,τι δημοσιεύει η
            ίδια η ένωση.
          </p>
        </section>

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
          <p>
            Για συντάκτες: τα τελικά αποτελέσματα όλων των κατηγοριών ως{" "}
            <ApiLink path="/apotelesmata.rss">RSS</ApiLink>, κάθε κατηγορία
            ως ημερολόγιο από τη σελίδα «Αγώνες», και η βαθμολογία για
            ενσωμάτωση σε site από τη{" "}
            <Link href="/embed/vathmologia">σελίδα ενσωμάτωσης</Link>.
          </p>
        </section>

        <section className={styles.card} aria-labelledby="privacy">
          <h2 id="privacy" className={styles.heading}>
            Απόρρητο
          </h2>
          <p>
            Δεν υπάρχουν λογαριασμοί για αναγνώστες, διαφημίσεις ή εργαλεία
            παρακολούθησης. Ό,τι θυμάται η σελίδα μένει{" "}
            <strong>στον δικό σου browser</strong>:
          </p>
          <ul className={styles.list}>
            <li>η ομάδα ή οι ομάδες που διάλεξες με το ☆·</li>
            <li>το θέμα εμφάνισης (φωτεινό/σκοτεινό)·</li>
            <li>η κατηγορία που είδες τελευταία (cookie)·</li>
            <li>αν είδες ήδη το καλωσόρισμα·</li>
            <li>πότε φόρτωσες κάθε σελίδα, για να σου λέει πόσο παλιά είναι χωρίς σύνδεση.</li>
          </ul>
          <p>
            Στον server φτάνουν μόνο: ένας τυχαίος αριθμός αν ψηφίσεις σε
            πρόβλεψη ή MVP (για να μη μετρηθεί η ψήφος δύο φορές), και η
            διεύθυνση ειδοποιήσεων του browser αν ενεργοποιήσεις ειδοποιήσεις.
            Κανένα από τα δύο δεν λέει ποιος είσαι. Τα σβήνεις όλα αδειάζοντας
            τα δεδομένα του site στον browser.
          </p>
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
          <p>
            Είσαι από σωματείο και θέλεις να δηλώνεις τα σκορ της ομάδας σου;{" "}
            <Link href="/ethelontis">Δήλωση αγώνα</Link>.
          </p>
        </section>
      </div>
    </>
  );
}
