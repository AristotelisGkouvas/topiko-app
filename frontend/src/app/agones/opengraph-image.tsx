import { ImageResponse } from "next/og";

import { api } from "@/lib/api";
import { COLORS, DISPLAY, OG_CONTENT_TYPE, OG_SIZE, grass, ogFonts } from "@/lib/og";
import { formatDayDate, formatTime, listName, upper } from "@/lib/format";
import { leagueLabel, resolveLeague, resolveMatchday } from "@/lib/leagues";
import type { Match } from "@/lib/types";

/** Never prerendered: the card draws live fixtures, and at build time there
 *  is no API to draw them from. Social platforms cache the result themselves,
 *  so generating per request costs nothing a reader would notice. */
export const dynamic = "force-dynamic";

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = "Πρόγραμμα αγωνιστικής";

/** Screen S4: one round, as a Facebook card.
 *
 *  Kickoff on the left in the on-navy green, the two clubs meeting in the
 *  middle around a "vs". Home on the right of its own cell and away on the
 *  left of its own, so the two crests sit either side of the centre line and
 *  the fixture reads as a fixture rather than as a list of names.
 *
 *  Seven rows at most. An eighth would need the height to come out of the row,
 *  and a 40px row is not readable in a timeline — which is the only place this
 *  image is ever seen.
 */
const MAX_ROWS = 7;

export default async function Image({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const params = searchParams ?? {};
  const { league, season } = await resolveLeague(params);
  const fonts = await ogFonts();

  if (!league) {
    return new ImageResponse(<div style={empty}>ΠΑΜΕ ΣΕΝΤΡΑ</div>, {
      ...size,
      fonts,
    });
  }

  const matchday = resolveMatchday(params, league);
  const matches = await api
    .listMatches(league.slug, { matchday, season })
    .catch(() => []);
  const rows = matches.slice(0, MAX_ROWS);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: COLORS.navy,
          fontFamily: DISPLAY,
        }}
      >
        <div
          style={{
            height: 76,
            display: "flex",
            alignItems: "center",
            padding: "0 48px",
            background: grass(60),
          }}
        >
          <span style={{ fontSize: 26, fontWeight: 800, color: "#fff", letterSpacing: 1.5 }}>
            {matchday}η ΑΓΩΝΙΣΤΙΚΗ
          </span>
          <span
            style={{
              marginLeft: "auto",
              fontSize: 20,
              fontWeight: 600,
              color: "#fff",
              letterSpacing: 1,
            }}
          >
            {upper(leagueLabel(league))}
            {span(rows) ? ` · ${span(rows)}` : ""}
          </span>
        </div>

        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            padding: "0 48px",
          }}
        >
          {rows.map((match) => (
            <div
              key={match.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 18,
                height: 60,
                borderBottom: `1px solid ${COLORS.navyLine}`,
                fontSize: 26,
                fontWeight: 700,
                color: COLORS.onNavy,
              }}
            >
              <span
                style={{
                  width: 130,
                  fontSize: 20,
                  fontWeight: 700,
                  color: COLORS.greenLight,
                }}
              >
                {match.kickoff_at
                  ? `${upper(formatDayDate(match.kickoff_at).split(" ")[0])} ${formatTime(match.kickoff_at)}`
                  : "—"}
              </span>

              <span
                style={{
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "flex-end",
                  gap: 12,
                  overflow: "hidden",
                }}
              >
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {listName(match.home_team)}
                </span>
                <Badge team={match.home_team} />
              </span>

              <span
                style={{
                  width: 60,
                  textAlign: "center",
                  fontSize: 18,
                  fontWeight: 600,
                  color: COLORS.onNavyMuted,
                }}
              >
                {match.home_score !== null && match.away_score !== null
                  ? `${match.home_score}–${match.away_score}`
                  : "vs"}
              </span>

              <span
                style={{
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  overflow: "hidden",
                }}
              >
                <Badge team={match.away_team} />
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {listName(match.away_team)}
                </span>
              </span>
            </div>
          ))}
        </div>

        <div
          style={{
            display: "flex",
            padding: "0 48px 18px",
            fontSize: 18,
            fontWeight: 600,
            color: COLORS.onNavyMuted,
          }}
        >
          ΠΑΜΕ ΣΕΝΤΡΑ · ΕΠΣ ΗΠΕΙΡΟΥ
          {matches.length > MAX_ROWS && (
            <span style={{ marginLeft: "auto" }}>
              +{matches.length - MAX_ROWS} ακόμη
            </span>
          )}
        </div>
      </div>
    ),
    { ...size, fonts },
  );
}

function Badge({ team }: { team: Match["home_team"] }) {
  return (
    <div
      style={{
        width: 34,
        height: 34,
        borderRadius: 17,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: COLORS.onNavy,
        color: COLORS.navy,
        fontSize: 12,
        fontWeight: 800,
        flexShrink: 0,
      }}
    >
      {team.initials ?? team.name.slice(0, 2)}
    </div>
  );
}

/** "26–27 ΣΕΠΤΕΜΒΡΙΟΥ" — the days the round is spread over. */
function span(matches: Match[]): string {
  const dates = matches
    .map((m) => m.kickoff_at)
    .filter((d): d is string => d !== null)
    .sort();
  if (dates.length === 0) return "";

  const first = new Date(dates[0]);
  const last = new Date(dates[dates.length - 1]);
  const month = upper(
    new Intl.DateTimeFormat("el-GR", { month: "long" }).format(last),
  );
  const a = first.getDate();
  const b = last.getDate();
  return a === b ? `${a} ${month}` : `${a}–${b} ${month}`;
}

const empty = {
  width: "100%",
  height: "100%",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: COLORS.navy,
  color: COLORS.onNavy,
  fontSize: 64,
  fontWeight: 800,
  fontFamily: DISPLAY,
} as const;
