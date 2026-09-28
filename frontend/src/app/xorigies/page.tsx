import type { Metadata } from "next";

import { PageHeader } from "@/components/PageHeader";
import { api } from "@/lib/api";
import { InquiryForm } from "./InquiryForm";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Γίνε χορηγός",
  description:
    "Προβολή για την επιχείρησή σας δίπλα στο τοπικό ποδόσφαιρο της Ηπείρου: σε όλο το site, στις σελίδες αγώνων και στις εικόνες που μοιράζονται στο Facebook, με μηνιαία αναφορά προβολών.",
  alternates: { canonical: "/xorigies" },
};

const NUMBER = new Intl.NumberFormat("el-GR");
const DAY = new Intl.DateTimeFormat("el-GR", { day: "numeric", month: "long" });

/** Where a business finds out what sponsoring the site means, and says it
 *  is interested. One message, real numbers (once there are a month's worth),
 *  one action: the form. No prices yet: they follow the audience figures. */
export default async function SponsorshipPage() {
  const audience = await api.audience().catch(() => null);

  return (
    <>
      <PageHeader column="narrow" title="Γίνε χορηγός" />
      <div className={styles.page}>
        <p className={styles.lead}>
          Το λογότυπό σας δίπλα στο σκορ της Κυριακής: εκεί που ο κόσμος της
          Ηπείρου βλέπει αποτελέσματα, βαθμολογίες και live, και από εκεί που
          τα μοιράζεται στο Facebook και στο Viber.
        </p>
        <a href="#inquiry" className={styles.cta}>
          Μιλήστε μαζί μας
        </a>

        <section className={styles.block} aria-labelledby="audience">
          <h2 id="audience" className={styles.h2}>Ποιοι βλέπουν το site</h2>
          {audience?.ready ? (
            <dl className={styles.numbers}>
              <div>
                <dt>Επισκέπτες, τελευταίες 30 ημέρες</dt>
                <dd>{NUMBER.format(audience.visitors_30d)}</dd>
              </div>
              <div>
                <dt>Σελίδες που διαβάστηκαν</dt>
                <dd>{NUMBER.format(audience.views_30d)}</dd>
              </div>
              <div>
                <dt>Από κινητό</dt>
                <dd>{audience.mobile_share}%</dd>
              </div>
            </dl>
          ) : (
            <p className={styles.text}>
              {audience?.since
                ? `Μετράμε από τις ${DAY.format(new Date(audience.since))}. Τα πρώτα νούμερα βγαίνουν μόλις συμπληρωθεί ένας μήνας μέτρησης, για να είναι αληθινά και όχι της πρώτης εβδομάδας.`
                : "Μόλις συμπληρωθεί ένας μήνας μέτρησης, εδώ θα φαίνεται πόσοι επισκέπτες έρχονται και από πού."}{" "}
              Μέχρι τότε: 177 σωματεία, πάνω από 22.000 αγώνες από το 2014 και
              κάθε αγωνιστική όλων των κατηγοριών της ΕΠΣ Ηπείρου.
            </p>
          )}
        </section>

        <section className={styles.block} aria-labelledby="packages">
          <h2 id="packages" className={styles.h2}>Δύο τρόποι</h2>
          <div className={styles.packages}>
            <article className={styles.package}>
              <h3>Χορηγός του Πάμε Σέντρα</h3>
              <p>Για επιχειρήσεις που θέλουν να φαίνονται σε όλη την Ήπειρο.</p>
              <ul>
                <li>Στο κάτω μέρος κάθε σελίδας</li>
                <li>Στην αρχική</li>
                <li>Στις σελίδες των αγώνων</li>
                <li>Στις εικόνες αποτελεσμάτων για Facebook και Viber</li>
              </ul>
              <p className={styles.note}>Επιλέγετε θέσεις και διάρκεια.</p>
            </article>
            <article className={styles.package}>
              <h3>Χορηγός μιας ομάδας</h3>
              <p>
                Για τον φούρνο, το συνεργείο, το καφέ του χωριού: το λογότυπο
                στη σελίδα της ομάδας, στους αγώνες της και στις εικόνες της για
                το Facebook, μαζί με τη φανέλα.
              </p>
              <p className={styles.note}>
                Για τα σωματεία, δωρεάν την πρώτη σεζόν: η ομάδα το προσφέρει
                στους χορηγούς της και κρατά τα έσοδα.
              </p>
            </article>
          </div>
        </section>

        <section className={styles.block} aria-labelledby="report">
          <h2 id="report" className={styles.h2}>Ξέρετε τι παίρνετε</h2>
          <p className={styles.text}>
            Κάθε χορηγός έχει δικό του σύνδεσμο με τη μηνιαία αναφορά: πόσες
            φορές εμφανίστηκε το λογότυπο σε οθόνη και πόσοι το πάτησαν. Χωρίς
            cookies και χωρίς να παρακολουθούμε κανέναν.
          </p>
        </section>

        <section className={styles.block} aria-labelledby="rules">
          <h2 id="rules" className={styles.h2}>Οι κανόνες μας</h2>
          <p className={styles.text}>
            Στοίχημα, αλκοόλ και καπνός δεν εμφανίζονται ποτέ δίπλα σε παιδικά
            πρωταθλήματα, ούτε στις θέσεις που φαίνονται σε όλο το site.
          </p>
        </section>

        <section id="inquiry" className={styles.block} aria-labelledby="inquiry-title">
          <h2 id="inquiry-title" className={styles.h2}>Μιλήστε μαζί μας</h2>
          <p className={styles.text}>
            Αφήστε ένα τηλέφωνο ή ένα email και θα σας καλέσουμε. Οι τιμές
            εξαρτώνται από τις θέσεις και τη διάρκεια.
          </p>
          <InquiryForm />
        </section>
      </div>
    </>
  );
}
