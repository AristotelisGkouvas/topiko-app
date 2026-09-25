import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";

import { ApiError, api } from "@/lib/api";
import { listName } from "@/lib/format";
import { COLORS, Card, DISPLAY, ogFonts } from "@/lib/og";

/** The table as a picture, 1080×1350 — the size a group chat shows in full
 *  without cropping. Viber is how results travel in the federation, and a
 *  picture there is read by everybody; a link is opened by few. */
export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("liga");
  if (!slug) return new Response("Λείπει η κατηγορία (?liga=)", { status: 400 });

  let league, standings;
  try {
    [league, standings] = await Promise.all([api.getLeague(slug), api.getStandings(slug)]);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return new Response("Δεν βρέθηκε κατηγορία", { status: 404 });
    }
    throw error;
  }
  const rows = standings.slice(0, 16);
  const cell = { display: "flex", justifyContent: "flex-end", width: 90 } as const;

  const image = new ImageResponse(
    (
      <Card footer={`Βαθμολογία · ${league.short_name ?? league.name}`}>
        <div style={{ display: "flex", flexDirection: "column", width: "100%", fontFamily: DISPLAY }}>
          <div style={{ display: "flex", fontSize: 26, color: COLORS.onNavyMuted, paddingBottom: 10 }}>
            <div style={{ display: "flex", width: 60 }}>#</div>
            <div style={{ display: "flex", flex: 1 }}>ΟΜΑΔΑ</div>
            <div style={cell}>ΑΓ</div>
            <div style={cell}>ΔΤ</div>
            <div style={cell}>Β</div>
          </div>
          {rows.map((row) => (
            <div
              key={row.team.id}
              style={{
                display: "flex",
                alignItems: "center",
                fontSize: rows.length > 12 ? 34 : 40,
                fontWeight: 700,
                padding: "8px 0",
                borderTop: `1px solid ${COLORS.navyLine}`,
              }}
            >
              <div style={{ display: "flex", width: 60, color: COLORS.onNavyMuted }}>{row.position}</div>
              <div style={{ display: "flex", flex: 1 }}>{listName(row.team)}</div>
              <div style={cell}>{row.played}</div>
              <div style={cell}>{row.goal_difference > 0 ? `+${row.goal_difference}` : row.goal_difference}</div>
              <div style={{ ...cell, fontWeight: 800, color: COLORS.greenLight }}>{row.points}</div>
            </div>
          ))}
        </div>
      </Card>
    ),
    { width: 1080, height: 1350, fonts: await ogFonts() },
  );

  const headers = new Headers(image.headers);
  headers.set("Cache-Control", "public, max-age=600");
  if (req.nextUrl.searchParams.has("lipsi")) {
    headers.set("Content-Disposition", `attachment; filename="vathmologia-${slug}.png"`);
  }
  return new Response(image.body, { status: 200, headers });
}
