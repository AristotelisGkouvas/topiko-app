import Link from "next/link";

import styles from "./error.module.css";

export default function NotFound() {
  return (
    <div className={styles.wrap}>
      <h1 className={styles.title}>Δεν βρέθηκε</h1>
      <p className={styles.body}>
        Η σελίδα που ζήτησες δεν υπάρχει ή άλλαξε διεύθυνση.
      </p>
      <Link href="/" className={styles.action}>
        Στην αρχική
      </Link>
    </div>
  );
}
