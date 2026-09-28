import Link from "next/link";

import { Icon } from "@/components/Icon";
import { SectionHeader } from "@/components/SectionHeader";
import type { MatchSheet, SheetEvent, SheetPlayer } from "@/lib/types";
import styles from "./MatchSheetView.module.css";

/** The federation's report of a finished match: goals and cards in order,
 *  both line-ups with who came on and off, and the officials.
 *
 *  Substitutions are left out of the timeline and shown on the line-ups
 *  instead (the minute beside the name): twenty arrows between four goals
 *  buried the goals. */
export function MatchSheetView({
  sheet,
  homeTeamId,
  homeName,
  awayName,
}: {
  sheet: MatchSheet;
  homeTeamId: number;
  homeName: string;
  awayName: string;
}) {
  const moments = sheet.events.filter((e) => e.kind !== "sub_in" && e.kind !== "sub_out");
  const officials = Object.entries(sheet.officials);

  return (
    <section className={styles.sheet} aria-labelledby="sheet-heading">
      <SectionHeader id="sheet-heading" title="ΦΥΛΛΟ ΑΓΩΝΑ" />

      {moments.length > 0 && (
        <ol className={styles.timeline}>
          {moments.map((e, i) => (
            <Moment key={i} event={e} home={e.team_id === homeTeamId} />
          ))}
        </ol>
      )}

      {(sheet.home.length > 0 || sheet.away.length > 0) && (
        <div className={styles.lineups}>
          <Side name={homeName} players={sheet.home} />
          <Side name={awayName} players={sheet.away} />
        </div>
      )}

      {officials.length > 0 && (
        <dl className={styles.officials}>
          {officials.map(([label, name]) => (
            <div key={label} className={styles.official}>
              <dt>{label}</dt>
              <dd>{name}</dd>
            </div>
          ))}
        </dl>
      )}

      <p className={styles.source}>Από το φύλλο αγώνα της ένωσης.</p>
    </section>
  );
}

const minute = (m: number | null | undefined, extra?: number | null) =>
  m == null ? "" : extra ? `${m}+${extra}′` : `${m}′`;

const LABEL: Record<string, string> = {
  goal: "Γκολ",
  penalty_goal: "Γκολ με πέναλτι",
  own_goal: "Αυτογκόλ",
  yellow: "Κίτρινη κάρτα",
  second_yellow: "Δεύτερη κίτρινη",
  red: "Κόκκινη κάρτα",
};

function Moment({ event, home }: { event: SheetEvent; home: boolean }) {
  const name = event.player?.name ?? event.player_name ?? "Άγνωστος";
  const goal = event.kind === "goal" || event.kind === "penalty_goal" || event.kind === "own_goal";
  return (
    <li className={`${styles.moment} ${home ? styles.home : styles.away}`}>
      <span className={styles.minute}>{minute(event.minute, event.stoppage)}</span>
      <span className={styles.what} aria-label={LABEL[event.kind] ?? event.kind}>
        {goal ? <Icon name="ball" size={16} /> : <CardMark kind={event.kind} />}
      </span>
      <span className={styles.who}>
        {event.player ? (
          <Link href={`/paiktes/${event.player.slug}`}>{name}</Link>
        ) : (
          name
        )}
        {event.kind === "penalty_goal" && <span className={styles.tag}> (πέν.)</span>}
        {event.kind === "own_goal" && <span className={styles.tag}> (αυτ.)</span>}
      </span>
      {goal && event.score && <span className={styles.score}>{event.score}</span>}
    </li>
  );
}

/** Cards drawn, not typed: 🟨 and 🟥 came out orange and pink on some phones. */
function CardMark({ kind }: { kind: string }) {
  if (kind === "second_yellow") {
    return (
      <span className={styles.cards} aria-hidden="true">
        <span className={`${styles.card} ${styles.yellow}`} />
        <span className={`${styles.card} ${styles.red}`} />
      </span>
    );
  }
  return (
    <span
      className={`${styles.card} ${kind === "red" ? styles.red : styles.yellow}`}
      aria-hidden="true"
    />
  );
}

function Side({ name, players }: { name: string; players: SheetPlayer[] }) {
  const starters = players.filter((p) => p.starter);
  const bench = players.filter((p) => !p.starter);
  return (
    <div className={styles.side}>
      <h3 className={styles.sideName}>{name}</h3>
      <ul className={styles.list}>
        {starters.map((p, i) => (
          <Person key={i} p={p} />
        ))}
      </ul>
      {bench.length > 0 && (
        <>
          <p className={styles.benchLabel}>Αναπληρωματικοί</p>
          <ul className={styles.list}>
            {bench.map((p, i) => (
              <Person key={i} p={p} />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function Person({ p }: { p: SheetPlayer }) {
  const unused = !p.starter && p.on == null;
  return (
    <li className={`${styles.person} ${unused ? styles.unused : ""}`}>
      <span className={styles.personName}>
        {p.player ? <Link href={`/paiktes/${p.player.slug}`}>{p.name}</Link> : p.name}
      </span>
      <span className={styles.marks}>
        {!p.starter && p.on != null && (
          <span className={styles.on} title="Μπήκε">↑{minute(p.on)}</span>
        )}
        {p.off != null && !p.red && (
          <span className={styles.off} title="Βγήκε">↓{minute(p.off)}</span>
        )}
        {Array.from({ length: p.goals }, (_, i) => (
          <Icon key={`g${i}`} name="ball" size={14} />
        ))}
        {p.own_goals > 0 && <span className={styles.tag}>αυτ.</span>}
        {p.yellow > 0 && !p.red && <span className={`${styles.card} ${styles.yellow}`} title="Κίτρινη" />}
        {p.red && <span className={`${styles.card} ${styles.red}`} title="Αποβολή" />}
      </span>
    </li>
  );
}
