"use client";

import Link from "next/link";
import { useState } from "react";

import { ClubName } from "@/components/ClubName";
import { tally } from "@/components/HeadToHeadBar";
import type { Match, TeamRef } from "@/lib/types";
import styles from "./MatchHeadToHead.module.css";

const dateFmt = new Intl.DateTimeFormat("el-GR", {
  day: "2-digit",
  month: "2-digit",
  year: "2-digit",
  timeZone: "Europe/Athens",
});

/** The ΚΟΝΤΡΑ tab (screen 03 v2): how the two clubs have split their
 *  meetings, filterable to this fixture's venue, and the meetings themselves
 *  with the result from the home side's point of view. */
export function MatchHeadToHead({
  home,
  away,
  meetings,
}: {
  home: TeamRef;
  away: TeamRef;
  /** Newest first, home and away as played. */
  meetings: Match[];
}) {
  const [filter, setFilter] = useState<"all" | "venue">("all");
  const shown =
    filter === "all" ? meetings : meetings.filter((m) => m.home_team.id === home.id);
  const record = tally(shown, home.id);
  const total = record.home + record.draws + record.away;

  return (
    <>
      <div className={styles.chips} role="group" aria-label="Φίλτρο συναντήσεων">
        <button
          type="button"
          className={styles.chip}
          aria-pressed={filter === "all"}
          onClick={() => setFilter("all")}
        >
          Όλα
        </button>
        <button
          type="button"
          className={styles.chip}
          aria-pressed={filter === "venue"}
          onClick={() => setFilter("venue")}
        >
          Στην έδρα της <ClubName name={home.name} />
        </button>
      </div>

      {total > 0 && (
        <div className={styles.summary}>
          <div className={styles.bar} aria-hidden="true">
            {record.home > 0 && <span style={{ flex: record.home, background: tint(home, "var(--color-h2h-home)") }} />}
            {record.draws > 0 && <span style={{ flex: record.draws }} className={styles.draws} />}
            {record.away > 0 && <span style={{ flex: record.away, background: tint(away, "var(--color-h2h-away)") }} />}
          </div>
          <p className={styles.counts}>
            <span>
              <ClubName name={home.name} /> {record.home}
            </span>
            <span>Ισοπαλίες {record.draws}</span>
            <span>
              <ClubName name={away.name} /> {record.away}
            </span>
          </p>
        </div>
      )}

      <h3 className={styles.band}>ΤΕΛΕΥΤΑΙΕΣ ΣΥΝΑΝΤΗΣΕΙΣ</h3>
      {shown.length === 0 ? (
        <p className={styles.foot}>Καμία συνάντηση σε αυτή την έδρα.</p>
      ) : (
        <ol className={styles.list}>
          {shown.map((m) => (
            <li key={m.id}>
              <Meeting m={m} homeId={home.id} />
            </li>
          ))}
        </ol>
      )}
      <p className={styles.foot}>
        Ν/Ι/Η από τη μεριά της <ClubName name={home.name} />.{" "}
        <Link href={`/kontra/${home.slug}/${away.slug}`}>Όλη η κόντρα ›</Link>
      </p>
    </>
  );
}

/** A club's own colour for its share of the bar, when it has one. */
const tint = (team: TeamRef, fallback: string) => team.primary_color ?? fallback;

function Meeting({ m, homeId }: { m: Match; homeId: number }) {
  const played = m.home_score !== null && m.away_score !== null;
  const hs = m.home_score ?? 0;
  const as = m.away_score ?? 0;
  const ours = m.home_team.id === homeId ? hs - as : as - hs;
  const verdict = !played ? null : ours > 0 ? "Ν" : ours < 0 ? "Η" : "Ι";
  return (
    <Link href={`/agones/${m.id}`} className={styles.row}>
      <span className={styles.date}>{m.kickoff_at ? dateFmt.format(new Date(m.kickoff_at)) : "—"}</span>
      <span className={styles.names}>
        <span className={played && hs > as ? styles.won : undefined}>
          <ClubName name={m.home_team.name} />
        </span>
        <span className={played && as > hs ? styles.won : undefined}>
          <ClubName name={m.away_team.name} />
        </span>
      </span>
      <span className={styles.scores}>
        <span>{m.home_score ?? "–"}</span>
        <span>{m.away_score ?? "–"}</span>
      </span>
      {verdict ? (
        <span
          className={`${styles.verdict} ${verdict === "Ν" ? styles.w : verdict === "Η" ? styles.l : styles.d}`}
          aria-label={verdict === "Ν" ? "Νίκη" : verdict === "Η" ? "Ήττα" : "Ισοπαλία"}
        >
          {verdict}
        </span>
      ) : (
        <span />
      )}
    </Link>
  );
}
