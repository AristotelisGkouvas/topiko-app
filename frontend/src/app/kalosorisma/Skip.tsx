"use client";

import Link from "next/link";

import { markWelcomed } from "@/lib/onboarding";
import styles from "./page.module.css";

/** "Όχι τώρα" — which has to be remembered as an answer.
 *
 *  A plain link home left the welcome card waiting on the home page, so the
 *  reader who had just said no was asked again one screen later.
 */
export function Skip() {
  return (
    <Link href="/" className={styles.skip} onClick={() => markWelcomed()}>
      Όχι τώρα
    </Link>
  );
}
