import Link from "next/link";

import { ClubName } from "@/components/ClubName";
import { Crest } from "@/components/Crest";
import { Icon } from "@/components/Icon";
import type { SheetPlayer, TeamRef } from "@/lib/types";
import styles from "./MatchLineups.module.css";

/** The line-ups tab (screen 03 v2): both elevens side by side, row by row,
 *  then the benches. The report has no shirt numbers or positions, so each
 *  name carries what the player did instead — on, off, goals, cards. */
export function MatchLineups({
  home,
  away,
  homePlayers,
  awayPlayers,
}: {
  home: TeamRef;
  away: TeamRef;
  homePlayers: SheetPlayer[];
  awayPlayers: SheetPlayer[];
}) {
  const groups = [
    { label: "ΒΑΣΙΚΟΙ", h: homePlayers.filter((p) => p.starter), a: awayPlayers.filter((p) => p.starter) },
    { label: "ΑΝΑΠΛΗΡΩΜΑΤΙΚΟΙ", h: homePlayers.filter((p) => !p.starter), a: awayPlayers.filter((p) => !p.starter) },
  ].filter((g) => g.h.length + g.a.length > 0);

  return (
    <>
      <div className={styles.teams}>
        <span className={styles.team}>
          <Crest team={home} size="xs" />
          <span>
            <ClubName name={home.name} />
          </span>
        </span>
        <span className={`${styles.team} ${styles.right}`}>
          <span>
            <ClubName name={away.name} />
          </span>
          <Crest team={away} size="xs" />
        </span>
      </div>
      {groups.map((g) => (
        <section key={g.label} aria-label={g.label}>
          <h3 className={styles.band}>{g.label}</h3>
          {Array.from({ length: Math.max(g.h.length, g.a.length) }, (_, i) => (
            <div key={i} className={styles.row}>
              <Person p={g.h[i]} />
              <Person p={g.a[i]} right />
            </div>
          ))}
        </section>
      ))}
    </>
  );
}

const minute = (m: number) => `${m}'`;

function Person({ p, right = false }: { p: SheetPlayer | undefined; right?: boolean }) {
  if (!p) return <span />;
  const unused = !p.starter && p.on == null;
  return (
    <span className={`${styles.person} ${right ? styles.right : ""} ${unused ? styles.unused : ""}`}>
      <span className={styles.name}>
        {p.player ? <Link href={`/paiktes/${p.player.slug}`}>{p.name}</Link> : p.name}
      </span>
      <span className={styles.marks}>
        {!p.starter && p.on != null && (
          <span className={styles.on} title="Μπήκε">
            ↑{minute(p.on)}
          </span>
        )}
        {p.off != null && !p.red && (
          <span className={styles.off} title="Βγήκε">
            ↓{minute(p.off)}
          </span>
        )}
        {Array.from({ length: p.goals }, (_, i) => (
          <span key={i} title="Γκολ" className={styles.ball}>
            <Icon name="ball" size={13} />
          </span>
        ))}
        {p.own_goals > 0 && <span className={styles.tag}>αυτ.</span>}
        {p.yellow > 0 && !p.red && <span className={`${styles.card} ${styles.yellow}`} title="Κίτρινη" />}
        {p.red && <span className={`${styles.card} ${styles.red}`} title="Αποβολή" />}
      </span>
    </span>
  );
}
