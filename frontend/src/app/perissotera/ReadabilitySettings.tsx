"use client";

import { Toggle } from "../eidopoiiseis/Toggle";
import { NavIcon } from "@/components/NavIcon";
import { setReadability, useReadability } from "@/lib/readability";
import styles from "./page.module.css";

/** Two rows in "Ρυθμίσεις": bigger text, and a black-and-yellow palette for
 *  the sun or for weaker eyes. Both stay in this browser only. */
export function ReadabilitySettings() {
  const { large, contrast } = useReadability();
  return (
    <>
      <div className={styles.row}>
        <span className={styles.icon}>
          <NavIcon item={{ icon: "M4 18 9 6l5 12M6 14h6M15 18l3-7 3 7M16 16h4" }} size={20} />
        </span>
        <span className={styles.labelBlock}>
          <span className={styles.label}>Μεγάλα γράμματα</span>
          <span className={styles.description}>Όλο το κείμενο κατά ένα τέταρτο μεγαλύτερο</span>
        </span>
        <Toggle
          checked={large}
          onChange={(on) => setReadability("large", on)}
          label="Μεγάλα γράμματα"
        />
      </div>
      <div className={styles.row}>
        <span className={styles.icon}>
          <NavIcon item={{ icon: "M12 4a8 8 0 1 0 0 16zM12 4a8 8 0 0 1 0 16" }} size={20} />
        </span>
        <span className={styles.labelBlock}>
          <span className={styles.label}>Υψηλή αντίθεση</span>
          <span className={styles.description}>Μαύρο φόντο, λευκά και κίτρινα γράμματα — για τον ήλιο</span>
        </span>
        <Toggle
          checked={contrast}
          onChange={(on) => setReadability("contrast", on)}
          label="Υψηλή αντίθεση"
        />
      </div>
    </>
  );
}
