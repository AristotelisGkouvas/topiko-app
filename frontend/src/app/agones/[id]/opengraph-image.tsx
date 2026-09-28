import { ImageResponse } from "next/og";

import { api } from "@/lib/api";
import { formatDayDate } from "@/lib/format";
import { Card, COLORS, OG_CONTENT_TYPE, OG_SIZE, SponsorRow, clubSponsor, ogFonts, shareSponsors, type ShareSponsor } from "@/lib/og";

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
  let youth = true;

  // A card is the last thing that should take a page down: if the match cannot
  // be read, the link still unfurls with the site's own branding.
  try {
    const { match, league, home_sponsors, away_sponsors } = await api.getMatch(id);
    youth = league.age_group !== null;
    const played = match.home_score !== null && match.away_score !== null;
    // A live match says so: a card with 1–0 and no LIVE reads as a final
    // score in the group chat.
    const state = match.is_live
      ? match.status === "halftime"
        ? "ΗΜΙΧΡΟΝΟ"
        : `LIVE${match.minute ? ` · ${match.minute}΄` : ""}`
      : null;
    footer = [state, league.short_name ?? league.name, formatDayDate(match.kickoff_at)]
      .filter(Boolean)
      .join(" · ");

    body = (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <Side name={match.home_team.name} score={match.home_score} played={played} sponsor={clubSponsor(home_sponsors)} />
        <Side name={match.away_team.name} score={match.away_score} played={played} sponsor={clubSponsor(away_sponsors)} />
      </div>
    );
  } catch {
    // keep the fallback
  }

  return new ImageResponse(<Card footer={footer} sponsors={await shareSponsors({ youth })}>{body}</Card>, {
    ...size,
    fonts,
  });
}

function Side({
  name,
  score,
  played,
  sponsor,
}: {
  name: string;
  score: number | null;
  played: boolean;
  /** The club's main sponsor, beside its name. */
  sponsor: ShareSponsor | null;
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
          maxWidth: sponsor ? 760 : 880,
          alignItems: "center",
          gap: 20,
        }}
      >
        {name}
        {sponsor && <SponsorRow sponsors={[sponsor]} height={48} />}
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
