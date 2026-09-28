"use client";

import useSWR from "swr";

import { editorApi } from "@/lib/editorApi";
import type { SponsorInquiry } from "@/lib/types";
import page from "./page.module.css";
import styles from "./PlatformSponsorsAdmin.module.css";

const KIND: Record<string, string> = {
  platform: "Χορηγία πλατφόρμας",
  club: "Χορηγοί ομάδας",
  other: "Άλλο",
};

/** Who filled in "Γίνε χορηγός", unanswered first. "Έγινε" once somebody
 *  has called back; nothing is deleted. Hidden when there is nothing. */
export function SponsorInquiries() {
  const { data, mutate } = useSWR<SponsorInquiry[]>("editor:sponsor-inquiries", () =>
    editorApi.sponsorInquiries(),
  );
  if (!data || data.length === 0) return null;
  const open = data.filter((i) => !i.handled).length;

  return (
    <details className={styles.card} open={open > 0}>
      <summary className={page.title}>
        Αιτήματα χορηγίας {open > 0 ? `(${open} νέα)` : ""}
      </summary>
      <ul className={styles.list}>
        {data.map((i) => (
          <li key={i.id} className={i.handled ? styles.dim : undefined}>
            <p>
              <strong>{i.name}</strong>
              {i.business ? ` · ${i.business}` : ""} · {KIND[i.kind] ?? i.kind}
              {i.club ? ` · ${i.club}` : ""}
            </p>
            <p>
              {/* Shown as text to copy, and as a link where the device can dial. */}
              <a href={i.contact.includes("@") ? `mailto:${i.contact}` : `tel:${i.contact.replace(/\s+/g, "")}`}>
                {i.contact}
              </a>{" "}
              · {new Date(i.created_at).toLocaleDateString("el-GR")}
            </p>
            {i.message && <p>{i.message}</p>}
            <label>
              <input
                type="checkbox"
                checked={i.handled}
                onChange={async (e) =>
                  mutate(await editorApi.markInquiry(i.id, e.target.checked), { revalidate: false })
                }
              />{" "}
              Έγινε
            </label>
          </li>
        ))}
      </ul>
    </details>
  );
}
