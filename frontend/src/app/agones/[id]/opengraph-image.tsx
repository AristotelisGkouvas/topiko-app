import { ImageResponse } from "next/og";

import { api } from "@/lib/api";
import { formatDayDate } from "@/lib/format";
import { Card, COLORS, OG_CONTENT_TYPE, OG_SIZE, ogFonts } from "@/lib/og";

export const alt = "Αγώνας";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const fonts = await ogFonts();
  const { id: rawId } = await params;
  const id = Number.parseInt(rawId, 10);

  let body = <div style={{ display: "flex", fontSize: 56 }}>Αγώνας</div>;
  let footer: string | undefined;

  // A card is the last thing that should take a page down: if the match cannot
  // be read, the link still unfurls with the site's own branding.
  try {
    const { match, league } = await api.getMatch(id);
    const played = match.home_score !== null && match.away_score !== null;
    footer = [league.short_name ?? league.name, formatDayDate(match.kickoff_at)]
      .filter(Boolean)
      .join(" · ");

    body = (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <Side name={match.home_team.name} score={match.home_score} played={played} />
        <Side name={match.away_team.name} score={match.away_score} played={played} />
      </div>
    );
  } catch {
    // keep the fallback
  }

  return new ImageResponse(<Card footer={footer}>{body}</Card>, {
    ...size,
    fonts,
  });
}

function Side({
  name,
  score,
  played,
}: {
  name: string;
  score: number | null;
  played: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 28,
      }}
    >
      <div
        style={{
          display: "flex",
          fontSize: name.length > 24 ? 40 : 52,
          fontWeight: 700,
          lineHeight: 1.15,
          maxWidth: 880,
        }}
      >
        {name}
      </div>
      {played && (
        <div
          style={{
            display: "flex",
            fontSize: 72,
            fontWeight: 700,
            color: COLORS.canvas,
            minWidth: 90,
            justifyContent: "flex-end",
          }}
        >
          {score}
        </div>
      )}
    </div>
  );
}
