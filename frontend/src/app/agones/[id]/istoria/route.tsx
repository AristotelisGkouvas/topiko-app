import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";

import { ApiError, api } from "@/lib/api";
import { formatDayDate, formatTime } from "@/lib/format";
import { COLORS, Card, DISPLAY, ogFonts } from "@/lib/og";

/** The match as a 1080×1920 picture — the shape Instagram and Facebook
 *  stories take, which the 1200×630 link card is not.
 *
 *  Served as a file (`?lipsi=1` adds a download name) so the "Λήψη εικόνας"
 *  button can hand it straight to the phone's gallery. */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const matchId = Number.parseInt(id, 10);

  let detail;
  try {
    detail = await api.getMatch(matchId);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return new Response("Δεν βρέθηκε αγώνας", { status: 404 });
    }
    throw error;
  }
  const { match, league } = detail;
  const played = match.home_score !== null && match.away_score !== null;
  const state = match.is_live
    ? match.status === "halftime"
      ? "ΗΜΙΧΡΟΝΟ"
      : `LIVE${match.minute ? ` · ${match.minute}΄` : ""}`
    : played
      ? "ΤΕΛΙΚΟ"
      : [formatDayDate(match.kickoff_at), formatTime(match.kickoff_at)].filter(Boolean).join(" · ");

  const side = (name: string, score: number | null) => (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 18 }}>
      <div
        style={{
          display: "flex",
          fontFamily: DISPLAY,
          fontWeight: 800,
          fontSize: name.length > 22 ? 64 : 84,
          textAlign: "center",
          lineHeight: 1.1,
          maxWidth: 900,
        }}
      >
        {name}
      </div>
      {played && (
        <div style={{ display: "flex", fontFamily: DISPLAY, fontWeight: 800, fontSize: 220, lineHeight: 1 }}>
          {score}
        </div>
      )}
    </div>
  );

  const image = new ImageResponse(
    (
      <Card
        footer={[league.short_name ?? league.name, match.field?.name].filter(Boolean).join(" · ")}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 60,
            width: "100%",
          }}
        >
          <div
            style={{
              display: "flex",
              padding: "12px 28px",
              borderRadius: 999,
              background: match.is_live ? "#a8431e" : COLORS.green,
              fontFamily: DISPLAY,
              fontWeight: 700,
              fontSize: 44,
              letterSpacing: 3,
            }}
          >
            {state}
          </div>
          {side(match.home_team.name, match.home_score)}
          <div style={{ display: "flex", fontSize: 60, color: COLORS.onNavyMuted }}>—</div>
          {side(match.away_team.name, match.away_score)}
        </div>
      </Card>
    ),
    { width: 1080, height: 1920, fonts: await ogFonts() },
  );

  const headers = new Headers(image.headers);
  headers.set("Cache-Control", match.is_live ? "no-store" : "public, max-age=300");
  if (req.nextUrl.searchParams.has("lipsi")) {
    headers.set("Content-Disposition", `attachment; filename="agonas-${match.id}.png"`);
  }
  return new Response(image.body, { status: 200, headers });
}
