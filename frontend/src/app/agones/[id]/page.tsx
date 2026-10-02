import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { ClubName } from "@/components/ClubName";
import { Crest } from "@/components/Crest";
import { Icon } from "@/components/Icon";
import { LastUpdated } from "@/components/LastUpdated";
import { LiveRefresh } from "@/components/LiveRefresh";
import { MatchHeadToHead } from "@/components/MatchHeadToHead";
import { MatchLineups } from "@/components/MatchLineups";
import { MatchPresenter } from "@/components/MatchPresenter";
import { MatchTable } from "@/components/MatchTable";
import { MatchTabs, type MatchTab } from "@/components/MatchTabs";
import { MatchTimeline } from "@/components/MatchTimeline";
import { Prediction } from "@/components/Prediction";
import { QuickAnswers, type QuickAnswer } from "@/components/QuickAnswers";
import { ScoreFlash } from "@/components/ScoreFlash";
import { ShareButton } from "@/components/ShareButton";
import { SponsorStrip, alternate } from "@/components/SponsorStrip";
import { ApiError, api } from "@/lib/api";
import { fold } from "@/lib/greek";
import { formatDayDate, formatTime, listName, matchStatusLabel, upper } from "@/lib/format";
import { leagueLabel } from "@/lib/leagues";
import { sheetMoments } from "@/lib/moments";
import { JsonLd, absolute, breadcrumbs } from "@/lib/seo";
import type { League, Match, MatchDetail, MatchSheet } from "@/lib/types";
import styles from "./page.module.css";

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
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const [{ id }, { tab }] = await Promise.all([params, searchParams]);
  const {
    match,
    league,
    head_to_head,
    home_standing,
    away_standing,
    home_sponsors = [],
    away_sponsors = [],
    sheet,
  } = await load(id);
  // A sponsor or a table that failed to load costs its part, not the page.
  const [presenters, standings] = await Promise.all([
    api.listPlatformSponsors("match", league.age_group !== null).catch(() => []),
    home_standing || away_standing
      ? api.getStandings(league.slug, league.season.slug).catch(() => [])
      : Promise.resolve([]),
  ]);
  const presenter = presenters.length ? presenters[match.id % presenters.length] : null;

  const played = match.home_score !== null && match.away_score !== null;
  const live = match.status === "live" || match.status === "halftime";
  const home = match.home_team;
  const away = match.away_team;

  const directions = match.field
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        [match.field.name, match.field.city].filter(Boolean).join(", "),
      )}`
    : null;

  // The half blocks say their own score where the result gives it; the
  // second is the full-time score less the first.
  const ht =
    match.home_score_ht !== null && match.away_score_ht !== null
      ? ([match.home_score_ht, match.away_score_ht] as const)
      : null;
  const halfScores: [string | null, string | null] = [
    ht ? `${ht[0]} - ${ht[1]}` : null,
    ht && played && match.status !== "halftime"
      ? `${match.home_score! - ht[0]} - ${match.away_score! - ht[1]}`
      : null,
  ];

  const state = live
    ? match.status === "halftime"
      ? "ΗΜΙΧΡΟΝΟ"
      : match.minute
        ? `${match.minute > 45 ? "2ο" : "1ο"} ΗΜΙΧΡ. · ${match.minute}'`
        : "LIVE"
    : matchStatusLabel(match.status, match.kickoff_at);

  const info: { k: string; v: ReactNode }[] = [
    {
      k: "Έναρξη",
      v:
        [formatDayDate(match.kickoff_at), formatTime(match.kickoff_at)].filter(Boolean).join(" · ") ||
        "Δεν έχει οριστεί",
    },
    ...(match.field
      ? [{ k: "Γήπεδο", v: <Link href={`/gipeda/${match.field.slug}`}>{match.field.name}</Link> }]
      : []),
    ...(match.referee ? [{ k: "Διαιτητής", v: match.referee }] : []),
    ...Object.entries(sheet?.officials ?? {})
      .filter(([label]) => !(match.referee && fold(label) === fold("Διαιτητής")))
      .map(([k, v]) => ({ k, v })),
  ];

  const summary = (
    <>
      <MatchTimeline
        matchId={match.id}
        homeTeamId={home.id}
        sheet={sheet && sheet.events.length > 0 ? sheetMoments(sheet.events, home.id) : null}
        halfScores={halfScores}
        live={live}
      />

      <h2 className={styles.band}>ΠΛΗΡΟΦΟΡΙΕΣ ΑΓΩΝΑ</h2>
      <div className={styles.info}>
        <dl className={styles.facts}>
          {info.map((r) => (
            <div key={r.k} className={styles.fact}>
              <dt>{r.k}</dt>
              <dd>{r.v}</dd>
            </div>
          ))}
        </dl>

        <div className={styles.actions}>
          {directions && (
            <a
              className={styles.primary}
              href={directions}
              target="_blank"
              rel="noopener noreferrer"
              data-track="directions"
              data-track-props={JSON.stringify({ match: match.id, field: match.field?.slug ?? null })}
            >
              Οδηγίες
            </a>
          )}
          <ShareButton
            title={`${home.name} – ${away.name}`}
            text={[
              `${listName(home)}–${listName(away)}${
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
          />
          {/* 9:16, for a story — the link card is the wrong shape for one. */}
          <a
            href={`/agones/${match.id}/istoria?lipsi=1`}
            download
            data-track="story"
            data-track-props={JSON.stringify({ match: match.id })}
            className={styles.square}
            aria-label="Κατέβασμα εικόνας για story (Instagram, Facebook)"
            title="Κατέβασμα εικόνας για story"
          >
            <Icon name="download" size={20} />
          </a>
        </div>

        {match.note && <p className={styles.note}>{match.note}</p>}

        {/* Where the number came from. A score typed during the match is a
            different claim from one lifted off the federation's own page. */}
        {played && match.data_source !== "scraper" && (
          <p className={styles.provenance}>
            {match.data_source === "manual_live"
              ? "Καταχωρήθηκε χειροκίνητα· εκκρεμεί η επιβεβαίωση με το φύλλο αγώνα."
              : "Καταχωρήθηκε χειροκίνητα και ελέγχθηκε με το φύλλο αγώνα."}
          </p>
        )}
        {/* The last change or the last check against the federation,
            whichever is newer — an untouched fixture is not a stale one. */}
        <LastUpdated
          timestamp={
            match.last_scraped_at && match.last_scraped_at > match.updated_at
              ? match.last_scraped_at
              : match.updated_at
          }
        />
        {REPORT_TO && (
          <p className={styles.report}>
            <a
              href={`mailto:${REPORT_TO}?subject=${encodeURIComponent(
                `Λάθος: ${home.name} – ${away.name}`,
              )}&body=${encodeURIComponent(
                `Αγώνας #${match.id} (${formatDayDate(match.kickoff_at)})\n` +
                  `Στη σελίδα: ${played ? `${match.home_score}–${match.away_score}` : "χωρίς σκορ"}\n` +
                  "Το σωστό είναι: ",
              )}`}
            >
              Αναφορά λάθους
            </a>
          </p>
        )}
      </div>

      <div className={styles.extras}>
        <Prediction matchId={match.id} home={home} away={away} />
        <QuickAnswers id="match-faq" items={matchFaq(match, league, sheet ?? null, live)} />
      </div>

      <SponsorStrip
        sponsors={alternate(home_sponsors, away_sponsors).filter(
          // The match's own sponsor is already named over the score.
          (s) => !presenter || fold(s.name) !== fold(presenter.name),
        )}
        kind="club"
        label="Χορηγοί ομάδων"
      />
    </>
  );

  const tabs: MatchTab[] = [
    { id: "synopsi", label: "ΣΥΝΟΨΗ", panel: summary },
    ...(sheet && (sheet.home.length > 0 || sheet.away.length > 0)
      ? [
          {
            id: "syntheseis",
            label: "ΣΥΝΘΕΣΕΙΣ",
            panel: (
              <MatchLineups home={home} away={away} homePlayers={sheet.home} awayPlayers={sheet.away} />
            ),
          },
        ]
      : []),
    ...(head_to_head.length > 0
      ? [
          {
            id: "kontra",
            label: "ΚΟΝΤΡΑ",
            panel: <MatchHeadToHead home={home} away={away} meetings={head_to_head} />,
          },
        ]
      : []),
    ...(standings.length > 0
      ? [
          {
            id: "vathmologia",
            label: "ΒΑΘΜΟΛΟΓΙΑ",
            panel: <MatchTable rows={standings} teamIds={[home.id, away.id]} leagueSlug={league.slug} />,
          },
        ]
      : []),
  ];

  return (
    <div className={styles.page}>
      <JsonLd
        data={[
          ...[matchJsonLd(match, league.name)].filter((d) => d !== null),
          breadcrumbs([
            { name: "Αγώνες", path: `/agones?liga=${league.slug}` },
            { name: `${home.name} - ${away.name}`, path: `/agones/${match.id}` },
          ]),
        ]}
      />
      {/* Screen 03 v2: a compact navy header — the score in under a quarter
          of the phone — and everything else in tabs below it. */}
      <div className={styles.hero}>
        {live && <LiveRefresh />}
        {/* The page's heading, for screen readers: the visual one is a
            scoreboard, and a bare "3" means nothing read out alone. */}
        <h1 className="srOnly">
          {played
            ? `${home.name} ${match.home_score}, ${away.name} ${match.away_score}`
            : `${home.name} – ${away.name}`}
          {" — "}
          {live && match.minute
            ? `σε εξέλιξη, ${match.minute}ο λεπτό`
            : matchStatusLabel(match.status, match.kickoff_at)}
        </h1>
        <nav className={styles.top} aria-label="Διαδρομή">
          <Link href={`/agones?liga=${league.slug}`} className={styles.back} aria-label="Πίσω στους αγώνες">
            ‹
          </Link>
          <span className={styles.crumb}>
            {upper(leagueLabel(league))}
            {match.matchday ? ` · ${match.matchday}η ΑΓΩΝΙΣΤΙΚΗ` : ""}
          </span>
          <span className={styles.back} aria-hidden="true" />
        </nav>

        <section className={styles.scoreboard}>
          <TeamSide team={home} />
          <div className={styles.middle}>
            <span className={styles.when}>
              {[formatDayDate(match.kickoff_at), played ? formatTime(match.kickoff_at) : null]
                .filter(Boolean)
                .join(" · ")}
            </span>
            {played ? (
              <p className={styles.score}>
                <ScoreFlash value={match.home_score} />
                <span className={styles.dash}>-</span>
                <ScoreFlash value={match.away_score} />
              </p>
            ) : (
              <p className={styles.kickoff}>{formatTime(match.kickoff_at) || "–"}</p>
            )}
            <span className={live ? styles.live : styles.state}>
              {live && <span className={styles.dot} aria-hidden="true" />}
              {state}
            </span>
          </div>
          <TeamSide team={away} />
        </section>

        <MatchPresenter sponsors={presenters} matchId={match.id} />
      </div>

      <div className={styles.body}>
        <MatchTabs tabs={tabs} initial={tab} />
      </div>
    </div>
  );
}

function TeamSide({ team }: { team: Match["home_team"] }) {
  return (
    <Link href={`/somateia/${team.slug}`} className={styles.side}>
      <Crest team={team} size="md" onNavy />
      <span className={styles.sideName}>
        <ClubName name={team.name} />
      </span>
    </Link>
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
