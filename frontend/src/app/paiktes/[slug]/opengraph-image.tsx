import { ImageResponse } from "next/og";

import { notFound } from "next/navigation";

import { ApiError, api } from "@/lib/api";
import { Card, COLORS, OG_CONTENT_TYPE, OG_SIZE, ogFonts } from "@/lib/og";
import { plural } from "@/lib/format";

export const alt = "Παίκτης";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const fonts = await ogFonts();
  const { slug } = await params;

  let name = "Παίκτης";
  let line = "";
  let footer: string | undefined;

  try {
    const player = await api.getPlayer(slug);
    name = player.name;
    // The number is the reason this gets shared, so it leads.
    line = player.total_goals
      ? `${player.total_goals} γκολ σε ${player.seasons_scored} ${plural(player.seasons_scored, "περίοδο", "περιόδους")}`
      : "Στο μητρώο της ΕΠΣ Ηπείρου";
    footer = player.clubs.map((club) => club.name).slice(0, 3).join(" · ");
  } catch (error) {
    // A slug that does not exist is a 404, not a generic card: otherwise any
    // made-up URL unfurls as if it were a real player.
    if (error instanceof ApiError && error.status === 404) notFound();
    // Anything else keeps the fallback.
  }

  return new ImageResponse(
    (
      <Card footer={footer}>
        <div
          style={{
            display: "flex",
            fontSize: name.length > 26 ? 56 : 72,
            fontWeight: 700,
            lineHeight: 1.1,
          }}
        >
          {name}
        </div>
        <div style={{ display: "flex", fontSize: 40, color: COLORS.canvas, opacity: 0.9 }}>
          {line}
        </div>
      </Card>
    ),
    { ...size, fonts },
  );
}
