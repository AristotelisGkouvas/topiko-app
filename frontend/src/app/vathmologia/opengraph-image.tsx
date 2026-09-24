import { ImageResponse } from "next/og";

import { api } from "@/lib/api";
import { COLORS, DISPLAY, OG_CONTENT_TYPE, OG_SIZE, grass, ogFonts } from "@/lib/og";
import { formatGoalDifference, listName } from "@/lib/format";
import { leagueLabel, resolveLeague } from "@/lib/leagues";

/** Never prerendered: the card draws live standings, and at build time there
 *  is no API to draw them from. Social platforms cache the result themselves,
 *  so generating per request costs nothing a reader would notice. */
export const dynamic = "force-dynamic";

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = "Βαθμολογία";

/** Screen S2: the table as a Facebook card.
 *
 *  Two columns of seven, because a division is fourteen clubs and a single
 *  column at this height would set them at 30px — unreadable in a timeline,
 *  which is the only place this image is ever seen.
 *
 *  Promotion places keep their green rail. It is the one piece of information
 *  in the table that is not a number, and it survives being scaled down to a
 *  thumbnail when the digits do not.
 */
export default async function Image({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const { league, season } = await resolveLeague(searchParams ?? {});
  const fonts = await ogFonts();

  if (!league) {
    return new ImageResponse(
      (
        <div style={empty}>
          <span>ΠΑΜΕ ΣΕΝΤΡΑ</span>
        </div>
      ),
      { ...size, fonts },
    );
  }

  const standings = await api.getStandings(league.slug, season).catch(() => []);
  const rows = standings.slice(0, 14);
  const half = Math.ceil(rows.length / 2);
  const columns = [rows.slice(0, half), rows.slice(half)];

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
          <span
            style={{
              fontSize: 26,
              fontWeight: 800,
              color: "#fff",
              letterSpacing: 1.5,
            }}
          >
            ΒΑΘΜΟΛΟΓΙΑ
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
            {leagueLabel(league).toLocaleUpperCase("el-GR")}
            {league.current_matchday
              ? ` · ΜΕΤΑ ΤΗΝ ${league.current_matchday}η`
              : ""}
          </span>
        </div>

        <div
          style={{
            flex: 1,
            display: "flex",
            gap: 56,
            padding: "22px 48px 10px",
          }}
        >
          {columns.map((column, i) => (
            <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column" }}>
              {column.map((row) => (
                <div
                  key={row.team.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    height: 57,
                    paddingLeft: 12,
                    borderBottom: `1px solid ${COLORS.navyLine}`,
                    fontSize: 24,
                    fontWeight: 700,
                    color: COLORS.onNavy,
                    // Satori has no box-shadow, so the zone rail is a real
                    // border on the leading edge.
                    borderLeft: `4px solid ${
                      row.zone === "promotion" ? COLORS.greenLight : "transparent"
                    }`,
                  }}
                >
                  <span style={{ width: 40, color: COLORS.onNavyMuted }}>
                    {row.position}
                  </span>
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 16,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: COLORS.onNavy,
                      color: COLORS.navy,
                      fontSize: 12,
                      fontWeight: 800,
                    }}
                  >
                    {row.team.initials ?? row.team.name.slice(0, 2)}
                  </div>
                  <span
                    style={{
                      flex: 1,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {listName(row.team)}
                  </span>
                  <span
                    style={{
                      width: 60,
                      textAlign: "right",
                      fontSize: 19,
                      fontWeight: 600,
                      color: COLORS.onNavyMuted,
                    }}
                  >
                    {formatGoalDifference(row.goal_difference)}
                  </span>
                  <span style={{ width: 50, textAlign: "right", fontSize: 28, fontWeight: 800 }}>
                    {row.points}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            padding: "0 48px 18px",
            fontSize: 18,
            fontWeight: 600,
            color: COLORS.onNavyMuted,
          }}
        >
          ΠΑΜΕ ΣΕΝΤΡΑ · ΕΠΣ ΗΠΕΙΡΟΥ
        </div>
      </div>
    ),
    { ...size, fonts },
  );
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
