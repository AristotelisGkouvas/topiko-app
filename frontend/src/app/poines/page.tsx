import type { Metadata } from "next";
import Link from "next/link";

import { BandHeader } from "@/components/BandHeader";
import { Crest } from "@/components/Crest";
import { LastUpdated } from "@/components/LastUpdated";
import { SeasonPicker } from "@/components/SeasonPicker";
import { SelectNav } from "@/components/SelectNav";
import { Empty } from "@/components/States";
import { api } from "@/lib/api";
import { formatDayDate } from "@/lib/format";
import { leagueLabel, readParam, type SearchParams } from "@/lib/leagues";
import type { League, Suspension } from "@/lib/types";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Ποινές",
  description: "Ποιοι παίκτες δεν αγωνίζονται και για πόσους αγώνες.",
};

/** Whether a ban still keeps the player out, and the words for it. A ban
 *  from the Nth round runs the next `matches` rounds; it is still on while
 *  its last round has not yet been played. Without a round on the ban, or
 *  outside the current season, it cannot be placed and counts as served. */
function standing(ban: Suspension, next: number | null): { active: boolean; text: string } {
  if (!next || !ban.matchday) return { active: false, text: "Εξέτισε" };
  const last = ban.matchday + ban.matches;
  if (last < next) return { active: false, text: "Εξέτισε" };
  return { active: true, text: last === next ? `Εκτός στην ${next}η` : `Εκτός ${next}η–${last}η` };
}

export default async function SuspensionsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const season = readParam(params, "periodos");
  const club = readParam(params, "somateio");
  const league = readParam(params, "kat");
  const all = readParam(params, "ola") === "1";

  const [seasons, suspensions, leagues, meta] = await Promise.all([
    api.listSeasons(),
    api.listSuspensions({ season }),
    api.listLeagues(season).catch(() => [] as League[]),
    api.getMeta(),
  ]);

  const current = seasons.find((s) => s.is_current);
  const isCurrent = !season || season === current?.slug;
  // The next round of each division, for "who is out on Sunday".
  const nextRound = new Map(
    leagues.map((l) => [l.slug, isCurrent && l.current_matchday !== null ? l.current_matchday + 1 : null]),
  );

  const inLeague = league ? suspensions.filter((b) => b.league_slug === league) : suspensions;
  const rows = inLeague.map((ban) => ({ ban, ...standing(ban, nextRound.get(ban.league_slug) ?? null) }));
  const active = rows.filter((r) => r.active);
  const base = all ? rows : active;

  // A second ban this season, marked on the newest one.
  const count = new Map<number, number>();
  for (const r of rows) count.set(r.ban.player.id, (count.get(r.ban.player.id) ?? 0) + 1);
  const firstSeen = new Set<number>();
  const repeat = new Set<number>();
  for (const r of rows) {
    if ((count.get(r.ban.player.id) ?? 0) > 1 && !firstSeen.has(r.ban.player.id)) repeat.add(r.ban.id);
    firstSeen.add(r.ban.player.id);
  }

  const clubsHere = [
    ...new Map(base.filter((r) => r.ban.team).map((r) => [r.ban.team!.slug, r.ban.team!])).values(),
  ].sort((a, b) => a.name.localeCompare(b.name, "el"));
  const shown = club ? base.filter((r) => r.ban.team?.slug === club) : base;

  // Matches banned per club over everything on show, for the bars.
  const totals = new Map<string, { name: string; n: number }>();
  for (const r of rows) {
    if (!r.ban.team) continue;
    const t = totals.get(r.ban.team.slug) ?? { name: r.ban.team.name, n: 0 };
    t.n += r.ban.matches;
    totals.set(r.ban.team.slug, t);
  }
  const perClub = [...totals.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 10);
  const top = perClub[0]?.[1].n ?? 1;

  const href = (changes: Record<string, string | null>) => {
    const p = new URLSearchParams();
    if (season) p.set("periodos", season);
    if (league) p.set("kat", league);
    if (all) p.set("ola", "1");
    if (club) p.set("somateio", club);
    for (const [k, v] of Object.entries(changes)) {
      if (v === null) p.delete(k);
      else p.set(k, v);
    }
    const q = p.toString();
    return q ? `/poines?${q}` : "/poines";
  };

  const leaguesWithBans = leagues.filter((l) => suspensions.some((b) => b.league_slug === l.slug));

  return (
    <div className={styles.page}>
      <BandHeader
        crumbs={[{ label: "Στατιστικά" }, { label: "Ποινές" }]}
        title="Ποινές"
        sub="Ποιοι δεν παίζουν και για πόσους αγώνες."
        aside={
          <div className={styles.filters}>
            <SeasonPicker seasons={seasons} active={season} compact />
            {leaguesWithBans.length > 1 && (
              <SelectNav
                param="kat"
                value={league ?? ""}
                label="Κατηγορία"
                reset={["somateio"]}
                options={[
                  { value: "", label: "Όλες οι κατηγορίες" },
                  ...leaguesWithBans.map((l) => ({ value: l.slug, label: leagueLabel(l) })),
                ]}
              />
            )}
          </div>
        }
        below={
      <nav className={styles.tabs} aria-label="Ποινές">
        <div className={styles.tabsInner}>
          <Link
            href={href({ ola: null, somateio: null })}
            className={styles.tab}
            aria-current={!all ? "page" : undefined}
            scroll={false}
          >
            Εκτός τώρα <span className={styles.badge}>{active.length}</span>
          </Link>
          <Link
            href={href({ ola: "1", somateio: null })}
            className={styles.tab}
            aria-current={all ? "page" : undefined}
            scroll={false}
          >
            Όλες οι ποινές <span className={styles.badge}>{rows.length}</span>
          </Link>
        </div>
      </nav>
        }
      />


      <div className={styles.body}>
        <div className={styles.main}>
          {clubsHere.length > 1 && (
            <div className={styles.chips} role="group" aria-label="Σωματείο">
              <Link
                href={href({ somateio: null })}
                className={styles.chip}
                aria-current={!club ? "true" : undefined}
                scroll={false}
              >
                Όλα
              </Link>
              {clubsHere.map((c) => (
                <Link
                  key={c.slug}
                  href={href({ somateio: c.slug })}
                  className={styles.chip}
                  aria-current={club === c.slug ? "true" : undefined}
                  scroll={false}
                >
                  {c.name}
                </Link>
              ))}
            </div>
          )}

          {shown.length > 0 ? (
            <ul className={styles.list}>
              {shown.map(({ ban, active: on, text }) => (
                <li key={ban.id}>
                  <Link href={`/paiktes/${ban.player.slug}`} className={styles.row}>
                    <span className={`${styles.box} ${on ? styles.boxOn : ""}`}>
                      <span className={styles.boxNum}>{ban.matches}</span>
                      <span className={styles.boxUnit}>{ban.matches === 1 ? "ΑΓΩΝΑΣ" : "ΑΓΩΝΕΣ"}</span>
                    </span>
                    <span className={styles.who}>
                      <span className={styles.nameLine}>
                        <span className={styles.name}>{ban.player.name}</span>
                        {repeat.has(ban.id) && (
                          <span className={styles.again}>{count.get(ban.player.id)}η ΦΕΤΟΣ</span>
                        )}
                      </span>
                      <span className={styles.club}>
                        {ban.team && <Crest team={ban.team} size="xs" />}
                        <span>
                          {ban.team?.name ?? ban.fixture ?? "άγνωστο σωματείο"} · {ban.league_name}
                        </span>
                      </span>
                    </span>
                    <span className={styles.status}>
                      <span className={on ? styles.out : styles.served}>{text}</span>
                      <span className={styles.decided}>
                        Απόφαση: {ban.decided_on ? formatDayDate(ban.decided_on) : "—"}
                        {ban.matchday ? ` · ${ban.matchday}η αγων.` : ""}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <Empty
              title={all ? "Καμία ποινή" : "Κανείς εκτός"}
              body={
                all
                  ? "Δεν υπάρχει καταγεγραμμένη ποινή για αυτή την επιλογή."
                  : "Κανένας παίκτης δεν εκτίει ποινή για την επόμενη αγωνιστική."
              }
              action={!all ? { href: href({ ola: "1" }), label: "Όλες οι ποινές" } : undefined}
            />
          )}

          <LastUpdated timestamp={meta.last_scraped_at} sourceUrl={meta.source_url} />
        </div>

        <aside className={styles.side} aria-label="Ανά σωματείο">
          {perClub.length > 0 && (
            <section className={styles.block} aria-labelledby="per-club">
              <h2 id="per-club" className={styles.h2}>
                Ανά σωματείο
              </h2>
              <div className={styles.barsCard}>
                {perClub.map(([slug, t]) => (
                  <Link key={slug} href={`/somateia/${slug}`} className={styles.barRow}>
                    <span className={styles.barName}>{t.name}</span>
                    <span className={styles.bar} aria-hidden="true">
                      <span style={{ width: `${Math.round((t.n / top) * 100)}%` }} />
                    </span>
                    <span className={styles.barNum}>{t.n}</span>
                  </Link>
                ))}
                <p className={styles.barNote}>
                  Αγώνες ποινής συνολικά{season ? `, περίοδος ${season}` : current ? `, περίοδος ${current.slug}` : ""}
                </p>
              </div>
            </section>
          )}

          <section className={styles.notify}>
            <span className={styles.notifyTitle}>Ειδοποίηση για την ομάδα σου</span>
            <span className={styles.notifyText}>
              Μάθε πριν τον αγώνα ποιος δεν παίζει. Ακολούθησε την ομάδα και ενεργοποίησε τις ειδοποιήσεις.
            </span>
            <Link href="/somateia" className={styles.notifyButton}>
              Διάλεξε ομάδα
            </Link>
          </section>
        </aside>
      </div>
    </div>
  );
}
