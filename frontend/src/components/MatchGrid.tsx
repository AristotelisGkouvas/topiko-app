import { MatchCard } from "./MatchCard";
import { Empty } from "./States";
import type { Match } from "@/lib/types";
import styles from "./MatchGrid.module.css";

export function MatchGrid({
  matches,
  empty,
}: {
  matches: Match[];
  empty: { title: string; body?: string; action?: { href: string; label: string } };
}) {
  if (matches.length === 0) {
    return <Empty title={empty.title} body={empty.body} action={empty.action} />;
  }

  return (
    <div className={styles.grid}>
      {matches.map((match) => (
        <MatchCard key={match.id} match={match} />
      ))}
    </div>
  );
}
