import type { Metadata } from "next";

import { Desk } from "./Desk";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Δήλωση αγώνα",
  description: "Για εκπροσώπους σωματείων, με κωδικό.",
  // Not a page for search engines: it is a door, and the only people who
  // should arrive at it are the ones holding a card with a code on it.
  robots: { index: false, follow: false },
};

export default function VolunteerPage() {
  return (
    <div className={styles.page}>
      <Desk />
    </div>
  );
}
