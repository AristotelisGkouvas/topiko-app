import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { GoalMinutes } from "@/components/GoalMinutes";
import { HomeAway, splitRecord } from "@/components/HomeAway";
import { MatchRow } from "@/components/MatchRow";
import { PageHeader } from "@/components/PageHeader";
import { SectionHeader } from "@/components/SectionHeader";
import { ApiError, api } from "@/lib/api";
import { readParam, type SearchParams } from "@/lib/leagues";
import { RosterList } from "../roster/RosterList";
import { PrintButton } from "./PrintButton";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Ανάλυση αντιπάλου" };

/** Everything a coach reads before playing this club, on one printable page:
 *  where they stand, how they do away and at home, when they score and
 *  concede, who scores for them, who is banned, and the meetings between the
 *  two clubs. Reached from "Ανάλυση αντιπάλου" on the reader's own club. */
export default async function OpponentPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: SearchParams;
}) {
  const { slug } = await params;
  const me = readParam(await searchParams, "me");

  let team;
  try {
    team = await api.getTeam(slug);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }
  const [placement, matches] = await Promise.all([
    api.getTeamStanding(slug),
    api.getTeamMatches(slug),
  ]);
  const played = matches.filter((m) => m.home_score !== null && m.away_score !== null);
  const recentAway = played.filter((m) => m.away_team.id === team.id).slice(-5).reverse();
  const recentHome = played.filter((m) => m.home_team.id === team.id).slice(-5).reverse();
  const standing = placement?.standing;

  return (
    <>
      <PageHeader title={`Ανάλυση: ${team.short_name ?? team.name}`} />
      <div className={styles.page}>
        <p className={styles.lead}>
          {standing
            ? `${standing.position}η θέση, ${standing.points} βαθμοί · ${standing.won} νίκες, ${standing.drawn} ισοπαλίες, ${standing.lost} ήττες · γκολ ${standing.goals_for} υπέρ, ${standing.goals_against} κατά`
            : "Χωρίς θέση στη βαθμολογία αυτή την περίοδο."}
          {standing?.form ? ` · φόρμα ${standing.form.split("").join(" ")}` : ""}
        </p>

        <div className={styles.actions}>
          {me && me !== slug && (
            <Link href={`/kontra/${me}/${slug}`} className={styles.link}>
              Όλες οι μεταξύ μας συναντήσεις ›
            </Link>
          )}
          <PrintButton />
        </div>

        {played.length > 0 && (
          <section>
            <SectionHeader title="ΕΝΤΟΣ / ΕΚΤΟΣ" />
            <HomeAway record={splitRecord(team, played)} />
          </section>
        )}

        <section>
          <GoalMinutes slug={slug} title="ΠΟΤΕ ΣΚΟΡΑΡΟΥΝ ΚΑΙ ΠΟΤΕ ΔΕΧΟΝΤΑΙ" />
        </section>

        <div className={styles.twoCol}>
          {recentAway.length > 0 && (
            <section>
              <SectionHeader title="ΤΕΛΕΥΤΑΙΑ ΕΚΤΟΣ" />
              <div className={styles.card}>
                {recentAway.map((m, i) => (
                  <MatchRow key={m.id} match={m} last={i === recentAway.length - 1} showDate />
                ))}
              </div>
            </section>
          )}
          {recentHome.length > 0 && (
            <section>
              <SectionHeader title="ΤΕΛΕΥΤΑΙΑ ΕΝΤΟΣ" />
              <div className={styles.card}>
                {recentHome.map((m, i) => (
                  <MatchRow key={m.id} match={m} last={i === recentHome.length - 1} showDate />
                ))}
              </div>
            </section>
          )}
        </div>

        <section>
          <SectionHeader title="ΣΚΟΡΕΡ ΚΑΙ ΤΙΜΩΡΗΜΕΝΟΙ" />
          <RosterList slug={slug} />
        </section>
      </div>
    </>
  );
}
