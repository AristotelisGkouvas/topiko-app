"use client";

import useSWR from "swr";

import { editorApi } from "@/lib/editorApi";
import { daysUntil } from "@/lib/sponsorStatus";
import type { PlatformSponsorAdmin } from "@/lib/types";
import styles from "./page.module.css";

/** One line over the tabs when a platform sponsor ends within two weeks or
 *  ended in the last two — with a way straight to it. Nothing otherwise. */
export function ExpiringSponsors({ onOpen }: { onOpen: () => void }) {
  const { data } = useSWR<PlatformSponsorAdmin[]>("editor:platform-sponsors", () =>
    editorApi.platformSponsors(),
  );
  const due = (data ?? []).filter(
    (s) => s.is_active && s.ends_on && daysUntil(s.ends_on) <= 14 && daysUntil(s.ends_on) >= -14,
  );
  if (due.length === 0) return null;
  return (
    <p className={styles.sponsorDue} role="status">
      {due.length === 1
        ? `Ο χορηγός «${due[0].name}» θέλει ανανέωση (λήγει σύντομα ή έληξε).`
        : `${due.length} χορηγοί θέλουν ανανέωση (λήγουν σύντομα ή έληξαν).`}{" "}
      <button type="button" className={styles.linkButton} onClick={onOpen}>
        Άνοιγμα χορηγών ›
      </button>
    </p>
  );
}
