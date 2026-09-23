import type { Metadata } from "next";

import { MatchGrid } from "@/components/MatchGrid";
import { PageHeader, PageHeaderStepper } from "@/components/PageHeader";
import { api } from "@/lib/api";
import { formatDayDate } from "@/lib/format";
import { readParam, type SearchParams } from "@/lib/leagues";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Αγώνες",
  description: "Τι παίζεται και τι έγινε, μέρα με τη μέρα.",
};

/** One day at a time, fixtures and results together.
 *
 *  The design merges what were two tabs, and it is right to: a Sunday is one
 *  list, and whether a row is a fixture or a result depends only on what time
 *  it is. Two pages made the reader choose before being allowed to look, and
 *  the choice was wrong half the afternoon.
 */
export default async function MatchDayPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const asked = readParam(params, "imera");
  const day = await api.getMatchDay(asked);

  // `date` is a bare YYYY-MM-DD; the formatter wants something it can parse as
  // an instant, and noon keeps it on its own day in every timezone.
  const label = formatDayDate(`${day.date}T12:00:00Z`);
  const today = new Date().toISOString().slice(0, 10);
  const isToday = day.date === today;

  const href = (date: string) => `/agones?imera=${date}`;

  return (
    <>
      <PageHeader
        title="Αγώνες"
        aside={`${day.matches.length} ${day.matches.length === 1 ? "αγώνας" : "αγώνες"}`}
        controls={
          <PageHeaderStepper
            label={isToday ? `Σήμερα · ${label}` : label}
            previous={
              day.previous_date
                ? { href: href(day.previous_date), label: "Προηγούμενη αγωνιστική μέρα" }
                : undefined
            }
            next={
              day.next_date
                ? { href: href(day.next_date), label: "Επόμενη αγωνιστική μέρα" }
                : undefined
            }
          />
        }
      />

      <div className={styles.page}>
        {day.matches.length === 0 ? (
          // The design's own empty state for this screen: a big grey zero in a
          // ring, then the nearest day that has something. Saying only "no
          // matches" leaves the reader with nowhere to go from here.
          <div className={styles.empty}>
            <span className={styles.zero} aria-hidden="true">
              0
            </span>
            <p className={styles.emptyTitle}>Κανένας αγώνας</p>
            <p className={styles.emptyBody}>
              Δεν παίζεται τίποτα {isToday ? "σήμερα" : `στις ${label}`}.
            </p>
            <div className={styles.emptyActions}>
              {day.previous_date && (
                <a className={styles.emptyLink} href={href(day.previous_date)}>
                  ‹ {formatDayDate(`${day.previous_date}T12:00:00Z`)}
                </a>
              )}
              {day.next_date && (
                <a className={styles.emptyLink} href={href(day.next_date)}>
                  {formatDayDate(`${day.next_date}T12:00:00Z`)} ›
                </a>
              )}
            </div>
          </div>
        ) : (
          <MatchGrid
            matches={day.matches}
            empty={{ title: "Κανένας αγώνας", body: "" }}
          />
        )}
      </div>
    </>
  );
}
