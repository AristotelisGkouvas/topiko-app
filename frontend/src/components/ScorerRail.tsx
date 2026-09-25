import Link from "next/link";

import { Crest } from "@/components/Crest";

import { listName } from "@/lib/format";
import type { Scorer } from "@/lib/types";
import styles from "./ScorerRail.module.css";

/** The "ΣΚΟΡΕΡ" card from screens D01 and D04.
 *
 *  Three or four names, not the whole list. It is a pointer to the scorers
 *  page, and a rail that runs the length of the standings competes with the
 *  table it is meant to sit beside.
 *
 *  Shared position numbers rather than a running count: four players on four
 *  goals are all first, and printing 1-2-3-4 down the side of them says
 *  something the numbers do not support.
 */
/** Rank each scorer, giving equal totals the same number.
 *
 *  A plain loop in its own function rather than a reduce inside the render:
 *  the compiler refuses a variable reassigned while a component is rendering,
 *  and rightly — this is a computation over a list, not part of the view.
 */
function withSharedPositions(
  scorers: Scorer[],
): { scorer: Scorer; position: number }[] {
  const rows: { scorer: Scorer; position: number }[] = [];
  let position = 0;
  let previousGoals: number | null = null;

  for (const [index, scorer] of scorers.entries()) {
    if (scorer.goals !== previousGoals) {
      position = index + 1;
      previousGoals = scorer.goals;
    }
    rows.push({ scorer, position });
  }
  return rows;
}

export function ScorerRail({
  scorers,
  leagueSlug,
  limit = 4,
}: {
  scorers: Scorer[];
  leagueSlug: string;
  limit?: number;
}) {
  if (scorers.length === 0) return null;

  const rows = withSharedPositions(scorers.slice(0, limit));

  return (
    <div className={styles.card}>
      {rows.map(({ scorer, position: rank }) => (
        <Link
          key={scorer.player.slug}
          href={`/paiktes/${scorer.player.slug}`}
          className={styles.row}
        >
          <span className={styles.rank}>{rank}</span>
          <Crest team={scorer.team ?? { name: "—", initials: "—" }} size="sm" />
          <span className={styles.names}>
            <span className={styles.name}>{scorer.player.name}</span>
            {scorer.team && (
              <span className={styles.club}>{listName(scorer.team)}</span>
            )}
          </span>
          <span className={styles.goals}>{scorer.goals ?? 0}</span>
        </Link>
      ))}
      <Link href={`/skorer?liga=${leagueSlug}`} className={styles.all}>
        Όλοι οι σκόρερ ›
      </Link>
    </div>
  );
}
