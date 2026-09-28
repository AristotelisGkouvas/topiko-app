import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Crest } from "@/components/Crest";
import { HeadToHeadBar, tally } from "@/components/HeadToHeadBar";
import { Icon } from "@/components/Icon";
import { LastUpdated } from "@/components/LastUpdated";
import { LiveRefresh } from "@/components/LiveRefresh";
import { ShareButton } from "@/components/ShareButton";
import { ScoreFlash } from "@/components/ScoreFlash";
import { MatchTicker } from "@/components/MatchTicker";
import { Prediction } from "@/components/Prediction";
import { SectionHeader } from "@/components/SectionHeader";
import { MatchSheetView } from "@/components/MatchSheetView";
import { QuickAnswers, type QuickAnswer } from "@/components/QuickAnswers";
import { MatchPresenter } from "@/components/MatchPresenter";
import { SponsorStrip, alternate } from "@/components/SponsorStrip";
import { ApiError, api } from "@/lib/api";
import { fold } from "@/lib/greek";
import {
  formatDayDate,
  formatTime,
  listName,
  matchStatusLabel,
  pointsLabel,
} from "@/lib/format";
import { leagueLabel } from "@/lib/leagues";
import { JsonLd, absolute, breadcrumbs } from "@/lib/seo";
import type { League, Match, MatchDetail, MatchSheet, Standing } from "@/lib/types";
import styles from "./page.module.css";
import { ClubName } from "@/components/ClubName";

export const dynamic = "force-dynamic";

async function load(id: string): Promise<MatchDetail> {
  const numeric = Number.parseInt(id, 10);
  // Checked before the request: /agones/κάτι would otherwise reach the API as
  // NaN and come back as a 422 that renders like a broken page.
  if (!Number.isInteger(numeric) || numeric < 1) notFound();

  try {
    return await api.getMatch(numeric);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }
}

const EVENT_STATUS: Partial<Record<Match["status"], string>> = {
  postponed: "https://schema.org/EventPostponed",
  cancelled: "https://schema.org/EventCancelled",
};

/** schema.org SportsEvent. Google shows nothing for a match without a date,
 *  so an unscheduled one gets no event, only its breadcrumb. */
function matchJsonLd(match: Match, leagueName: string) {
  if (!match.kickoff_at) return null;
  const team = (t: Match["home_team"]) => ({
    "@type": "SportsTeam",
    name: t.name,
    url: absolute(`/somateia/${t.slug}`),
    sport: "Soccer",
  });
  return {
    "@context": "https://schema.org",
    "@type": "SportsEvent",
    name: `${match.home_team.name} - ${match.away_team.name}`,
    description: `${leagueName}${match.matchday ? `, ${match.matchday}η αγωνιστική` : ""}`,
    url: absolute(`/agones/${match.id}`),
    sport: "Soccer",
    startDate: match.kickoff_at,
    eventStatus: EVENT_STATUS[match.status] ?? "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    homeTeam: team(match.home_team),
    awayTeam: team(match.away_team),
    competitor: [team(match.home_team), team(match.away_team)],
    ...(match.field && {
      location: {
        "@type": "Place",
        name: match.field.name,
        url: absolute(`/gipeda/${match.field.slug}`),
        ...(match.field.city && { address: { "@type": "PostalAddress", addressLocality: match.field.city, addressCountry: "GR" } }),
      },
    }),
  };
}

/** Where "Αναφορά λάθους" writes to. Set at deploy time; without it the link
 *  is not shown rather than pointing nowhere. */
const REPORT_TO = process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim() || null;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  try {
    const { match, league } = await load(id);
    const played = match.home_score !== null && match.away_score !== null;
    // What the unfurled link and the search result say under the title: the
    // state and score, the round and division, the ground — so a stranger
    // from Άρτα knows what this is, and "αποτέλεσμα" is there to be matched.
    const description = [
      match.is_live
        ? `LIVE ${match.home_score ?? 0}–${match.away_score ?? 0}`
        : played
          ? `Τελικό αποτέλεσμα ${match.home_score}–${match.away_score}`
          : [formatDayDate(match.kickoff_at), formatTime(match.kickoff_at)]
              .filter(Boolean)
              .join(" "),
      [match.matchday ? `${match.matchday}η αγωνιστική` : null, `${leagueLabel(league)} ΕΠΣ Ηπείρου`]
        .filter(Boolean)
        .join(", "),
      match.field ? `γήπεδο ${match.field.name}` : null,
    ]
      .filter(Boolean)
      .join(" · ");
    const score = played && !match.is_live ? ` ${match.home_score}–${match.away_score}` : "";
    return {
      title: `${match.home_team.name} - ${match.away_team.name}${score}`,
      description,
      alternates: { canonical: `/agones/${match.id}` },
      // Next replaces, not merges, a child's openGraph — so the root's
      // fields are restated.
      openGraph: {
        type: "website",
        locale: "el_GR",
        siteName: "Πάμε Σέντρα",
        description,
      },
    };
  } catch {
    return { title: "Αγώνας" };
  }
}

export default async function MatchPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const {
    match,
    league,
    head_to_head,
    home_standing,
    away_standing,
    home_sponsors,
    away_sponsors,
    sheet,
  } = await load(id);
  // A sponsor that failed to load costs its line, not the match page.
  const presenters = await api
    .listPlatformSponsors("match", league.age_group !== null)
    .catch(() => []);
  const presenter = presenters.length ? presenters[match.id % presenters.length] : null;

  const played = match.home_score !== null && match.away_score !== null;
  const live = match.status === "live" || match.status === "halftime";

  const directions = match.field
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        [match.field.name, match.field.city].filter(Boolean).join(", "),
      )}`
    : null;
  const record = tally(head_to_head, match.home_team.id);

  return (
    <div className={styles.page}>
      <JsonLd
        data={[
          ...[matchJsonLd(match, league.name)].filter((d) => d !== null),
          breadcrumbs([
            { name: "Αγώνες", path: `/agones?liga=${league.slug}` },
            { name: `${match.home_team.name} - ${match.away_team.name}`, path: `/agones/${match.id}` },
          ]),
        ]}
      />
      {/* The navy band runs the full width and carries the crumb, the crests
          and the score. Screens 03 and D03 spend the page's whole block of
          brand colour here — it is the one thing the reader came for. */}
      <div className={styles.hero}>
        {live && <LiveRefresh />}
        {/* The page's heading, for screen readers: the visual one is a
            scoreboard, and a bare "3" means nothing read out alone. */}
        <h1 className="srOnly">
          {played
            ? `${match.home_team.name} ${match.home_score}, ${match.away_team.name} ${match.away_score}`
            : `${match.home_team.name} – ${match.away_team.name}`}
          {" — "}
          {live && match.minute
            ? `σε εξέλιξη, ${match.minute}ο λεπτό`
            : matchStatusLabel(match.status, match.kickoff_at)}
        </h1>
        <nav className={styles.breadcrumb} aria-label="Διαδρομή">
          <Link href={`/agones?liga=${league.slug}`}>‹ Αγώνες</Link>
          <span>
            {leagueLabel(league)}
            {match.matchday ? ` · ${match.matchday}η αγωνιστική` : ""}
          </span>
        </nav>

        {/* When and where, above the score — the first two questions
            anyone asks about a match, answered before they scroll. */}
        <div className={styles.when}>
          <p className={styles.whenDay}>
            {[
              formatDayDate(match.kickoff_at),
              formatTime(match.kickoff_at) || "ώρα δεν έχει οριστεί",
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {(match.field || match.referee) && (
            <p className={styles.whenPlace}>
              {match.field && (
                <Link href={`/gipeda/${match.field.slug}`}>{match.field.name}</Link>
              )}
              {match.field && match.referee && " · "}
              {/* Only when one has been appointed. */}
              {match.referee && <>Διαιτητής: {match.referee}</>}
            </p>
          )}
        </div>

        <MatchPresenter sponsors={presenters} matchId={match.id} />

        <section className={styles.scoreboard}>
        <TeamSide team={match.home_team} standing={home_standing} />

        <div className={styles.middle}>
          {played ? (
            <p className={`${styles.score} ${live ? styles.scoreLive : ""}`}>
              <ScoreFlash value={match.home_score} />
              <span className={styles.dash}>–</span>
              <ScoreFlash value={match.away_score} />
            </p>
          ) : (
            <p className={styles.kickoff}>{formatTime(match.kickoff_at)}</p>
          )}

          <p className={styles.state}>
            {live && match.minute
              ? `LIVE · ${match.minute}′`
              : matchStatusLabel(match.status, match.kickoff_at)}
          </p>

          {match.home_score_ht !== null && match.away_score_ht !== null && (
            <p className={styles.halftime}>
              ημίχρονο {match.home_score_ht}–{match.away_score_ht}
            </p>
          )}
        </div>

          <TeamSide team={match.away_team} standing={away_standing} />
        </section>
      </div>

      <SponsorStrip
        sponsors={alternate(home_sponsors, away_sponsors).filter(
          // The match's own sponsor is already named over the score; the same
          // logo again beside it read as noise, not as two deals.
          (s) => !presenter || fold(s.name) !== fold(presenter.name),
        )}
        kind="club"
        label="Χορηγοί ομάδων"
      />

      <div className={styles.body}>
        <div className={styles.info}>

          <div className={styles.actions}>
            {directions && (
              <a
                className={styles.primary}
                href={directions}
                target="_blank"
                rel="noopener noreferrer"
                data-track="directions"
                data-track-props={JSON.stringify({ match: match.id, field: match.field?.slug ?? null })}
                aria-label="Οδηγίες προς το γήπεδο"
                title="Οδηγίες προς το γήπεδο"
              >
                <Icon name="pin" size={22} />
              </a>
            )}
            <ShareButton
              title={`${match.home_team.name} – ${match.away_team.name}`}
              text={[
                `${listName(match.home_team)}–${listName(match.away_team)}${
                  played ? ` ${match.home_score}–${match.away_score}` : ""
                }${live ? " (LIVE)" : ""}`,
                played
                  ? null
                  : [formatDayDate(match.kickoff_at), formatTime(match.kickoff_at)]
                      .filter(Boolean)
                      .join(" "),
                match.field?.name,
              ]
                .filter(Boolean)
                .join(", ")}
              className={styles.secondary}
              iconOnly
            />
            {/* 9:16, for a story — the link card is the wrong shape for one. */}
            <a
              href={`/agones/${match.id}/istoria?lipsi=1`}
              download
              data-track="story"
              data-track-props={JSON.stringify({ match: match.id })}
              className={styles.secondary}
              aria-label="Κατέβασμα εικόνας για story (Instagram, Facebook)"
              title="Κατέβασμα εικόνας για story"
            >
              <Icon name="download" size={22} />
            </a>
          </div>

          {match.note && <p className={styles.note}>{match.note}</p>}

          {/* Where the number came from. A score an editor typed during the
              match is a different claim from one lifted off the federation's
              own page, and this is the one screen with room to say so. */}
          {/* "Who" names the kind of source, not the person: a live score
              may come from the club's volunteer or from the federation's
              desk, and saying "editor" for both was wrong half the time. */}
          {played && match.data_source !== "scraper" && (
            <p className={styles.provenance}>
              {match.data_source === "manual_live"
                ? "Καταχωρήθηκε χειροκίνητα· εκκρεμεί η επιβεβαίωση με το φύλλο αγώνα."
                : "Καταχωρήθηκε χειροκίνητα και ελέγχθηκε με το φύλλο αγώνα."}
            </p>
          )}
          {/* When, so that a score can be quoted with a time on it: the last
              change or the last check against the federation, whichever is
              newer — an untouched fixture is not a stale one. */}
          <LastUpdated
            timestamp={
              match.last_scraped_at && match.last_scraped_at > match.updated_at
                ? match.last_scraped_at
                : match.updated_at
            }
          />

          {/* Pre-filled, so the report names the match without anybody having
              to describe it. Only where there is an address to send it to. */}
          {REPORT_TO && (
            <p className={styles.report}>
              <a
                href={`mailto:${REPORT_TO}?subject=${encodeURIComponent(
                  `Λάθος: ${match.home_team.name} – ${match.away_team.name}`,
                )}&body=${encodeURIComponent(
                  `Αγώνας #${match.id} (${formatDayDate(match.kickoff_at)})
` +
                    `Στη σελίδα: ${played ? `${match.home_score}–${match.away_score}` : "χωρίς σκορ"}
` +
                    "Το σωστό είναι: ",
                )}`}
              >
                Αναφορά λάθους
              </a>
            </p>
          )}
        </div>

        <div className={styles.centre}>
          <MatchTicker
            matchId={match.id}
            homeName={match.home_team.short_name ?? match.home_team.name}
            awayName={match.away_team.short_name ?? match.away_team.name}
          />

          <Prediction matchId={match.id} home={match.home_team} away={match.away_team} />

          <QuickAnswers id="match-faq" items={matchFaq(match, league, sheet ?? null, live)} />

          {sheet && (
            <MatchSheetView
              sheet={sheet}
              homeTeamId={match.home_team.id}
              homeName={match.home_team.short_name ?? match.home_team.name}
              awayName={match.away_team.short_name ?? match.away_team.name}
            />
          )}

          {head_to_head.length > 0 && (
            <section className={styles.history}>
              <SectionHeader
                title="ΠΡΟΗΓΟΥΜΕΝΕΣ ΣΥΝΑΝΤΗΣΕΙΣ"
                action={{
                  href: `/kontra/${match.home_team.slug}/${match.away_team.slug}`,
                  label: "Λεπτομέρειες ›",
                }}
              />
              <div className={styles.historyCard}>
                <div className={styles.barWrap}>
                  <HeadToHeadBar
                    home={match.home_team}
                    away={match.away_team}
                    record={record}
                  />
                </div>
              </div>
            </section>
          )}
        </div>

        {(home_standing || away_standing) && (
          <aside className={styles.standings} aria-label="Θέσεις στη βαθμολογία">
            <SectionHeader
              title="ΣΤΗ ΒΑΘΜΟΛΟΓΙΑ"
              action={{
                href: `/vathmologia?liga=${league.slug}`,
                label: "Πλήρης ›",
              }}
            />
            <div className={styles.standingsCard}>
              {[
                { team: match.home_team, standing: home_standing },
                { team: match.away_team, standing: away_standing },
              ]
                .filter((row) => row.standing !== null)
                .map(({ team, standing }) => (
                  <Link
                    key={team.slug}
                    href={`/somateia/${team.slug}`}
                    className={styles.standingRow}
                  >
                    <span className={styles.standingPos}>
                      {standing!.position}
                    </span>
                    <Crest team={team} size="sm" />
                    <span className={styles.standingName}>
                      {team.short_name ?? team.name}
                    </span>
                    <span className={styles.standingPoints}>
                      {standing!.points}
                    </span>
                  </Link>
                ))}
            </div>
          </aside>
        )}
      </div>

    </div>
  );
}

function TeamSide({
  team,
  standing,
}: {
  team: Match["home_team"];
  standing: Standing | null;
}) {
  return (
    <div className={styles.side}>
      <Crest team={team} size="lg" />
      <Link href={`/somateia/${team.slug}`} className={styles.sideName}>
        <ClubName name={team.name} />
      </Link>
      {standing && (
        <span className={styles.position}>
          {standing.position}η θέση · {pointsLabel(standing.points)}
        </span>
      )}
    </div>
  );
}

/** What people ask about one match: the score or the kickoff, who scored and
 *  when, and where it is played. Each answer is one sentence from the page's
 *  own data, so an assistant can quote it as it stands. */
function matchFaq(
  match: Match,
  league: League,
  sheet: MatchSheet | null,
  live: boolean,
): QuickAnswer[] {
  const faq: QuickAnswer[] = [];
  const pair = `${match.home_team.name} – ${match.away_team.name}`;
  const when = match.kickoff_at
    ? `${formatDayDate(match.kickoff_at)} στις ${formatTime(match.kickoff_at)}`
    : null;
  const played = match.home_score !== null && match.away_score !== null;

  if (played && !live) {
    faq.push({
      q: `Ποιο ήταν το αποτέλεσμα στο ${pair};`,
      a: `${match.home_team.name} ${match.home_score}–${match.away_score} ${match.away_team.name}${
        match.kickoff_at ? `, ${formatDayDate(match.kickoff_at)}` : ""
      }, για την ${leagueLabel(league)} ΕΠΣ Ηπείρου.`,
    });
  } else if (!played && when) {
    faq.push({
      q: `Πότε παίζεται το ${pair};`,
      a: `${when}${match.field ? `, στο γήπεδο ${match.field.name}` : ""}.`,
    });
  }

  const goals = (sheet?.events ?? []).filter(
    (e) => e.kind === "goal" || e.kind === "penalty_goal" || e.kind === "own_goal",
  );
  if (goals.length > 0) {
    const forTeam = (teamId: number) =>
      goals
        .filter((e) =>
          e.kind === "own_goal" ? e.team_id !== teamId : e.team_id === teamId,
        )
        .map((e) => {
          const name = e.player?.name ?? e.player_name ?? "άγνωστος";
          const note = e.kind === "penalty_goal" ? ", πέναλτι" : e.kind === "own_goal" ? ", αυτογκόλ" : "";
          return e.minute != null ? `${name} (${e.minute}′${note})` : `${name}${note ? ` (${note.slice(2)})` : ""}`;
        });
    const home = forTeam(match.home_team.id);
    const away = forTeam(match.away_team.id);
    faq.push({
      q: `Ποιος σκόραρε στο ${pair};`,
      a: [
        home.length ? `Για ${match.home_team.name}: ${home.join(", ")}.` : null,
        away.length ? `Για ${match.away_team.name}: ${away.join(", ")}.` : null,
      ]
        .filter(Boolean)
        .join(" "),
    });
  }

  if (match.field) {
    faq.push({
      q: `Σε ποιο γήπεδο ${played ? "παίχτηκε" : "παίζεται"} το ${pair};`,
      a: `Στο γήπεδο ${match.field.name}${match.field.city ? `, ${match.field.city}` : ""}.`,
    });
  }
  return faq;
}
