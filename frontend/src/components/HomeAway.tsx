import type { Match } from "@/lib/types";
import styles from "./HomeAway.module.css";

interface Split {
  played: number;
  won: number;
  drawn: number;
  lost: number;
  scored: number;
  conceded: number;
}

/** Home and away, and when the goals come — what a coach reads before
 *  playing them. From the season's results, so it needs nothing the page does
 *  not already have. */
export function splitRecord(team: { id: number }, played: Match[]) {
  const empty = (): Split => ({ played: 0, won: 0, drawn: 0, lost: 0, scored: 0, conceded: 0 });
  const home = empty();
  const away = empty();
  let halvesKnown = 0;
  const firstHalf = { scored: 0, conceded: 0 };
  const secondHalf = { scored: 0, conceded: 0 };

  for (const m of played) {
    const atHome = m.home_team.id === team.id;
    const side = atHome ? home : away;
    const us = (atHome ? m.home_score : m.away_score) ?? 0;
    const them = (atHome ? m.away_score : m.home_score) ?? 0;
    side.played += 1;
    side.scored += us;
    side.conceded += them;
    if (us > them) side.won += 1;
    else if (us === them) side.drawn += 1;
    else side.lost += 1;

    if (m.home_score_ht !== null && m.away_score_ht !== null) {
      const usHt = atHome ? m.home_score_ht : m.away_score_ht;
      const themHt = atHome ? m.away_score_ht : m.home_score_ht;
      halvesKnown += 1;
      firstHalf.scored += usHt;
      firstHalf.conceded += themHt;
      secondHalf.scored += us - usHt;
      secondHalf.conceded += them - themHt;
    }
  }
  return { home, away, halvesKnown, firstHalf, secondHalf };
}

export function HomeAway({ record }: { record: ReturnType<typeof splitRecord> }) {
  const row = (label: string, s: Split) => (
    <tr>
      <th scope="row">{label}</th>
      <td>{s.played}</td>
      <td>{s.won}</td>
      <td>{s.drawn}</td>
      <td>{s.lost}</td>
      <td>
        {s.scored} – {s.conceded}
        <span className="srOnly"> (υπέρ – κατά)</span>
      </td>
    </tr>
  );
  return (
    <div className={styles.card}>
      <table className={styles.split}>
        <caption className="srOnly">Απόδοση εντός και εκτός έδρας</caption>
        <thead>
          <tr>
            <th scope="col" />
            <th scope="col"><abbr title="Αγώνες">ΑΓ</abbr></th>
            <th scope="col"><abbr title="Νίκες">Ν</abbr></th>
            <th scope="col"><abbr title="Ισοπαλίες">Ι</abbr></th>
            <th scope="col"><abbr title="Ήττες">Η</abbr></th>
            <th scope="col">ΓΚΟΛ</th>
          </tr>
        </thead>
        <tbody>
          {row("Εντός", record.home)}
          {row("Εκτός", record.away)}
        </tbody>
      </table>
      {record.halvesKnown > 0 && (
        <p className={styles.halves}>
          Γκολ ανά ημίχρονο ({record.halvesKnown}{" "}
          {record.halvesKnown === 1 ? "αγώνας" : "αγώνες"} με σκορ ημιχρόνου):
          α΄ ημίχρονο {record.firstHalf.scored} υπέρ, {record.firstHalf.conceded} κατά · β΄
          ημίχρονο {record.secondHalf.scored} υπέρ, {record.secondHalf.conceded} κατά
        </p>
      )}
    </div>
  );
}

