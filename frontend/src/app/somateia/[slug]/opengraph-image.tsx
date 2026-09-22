import { ImageResponse } from "next/og";

import { api } from "@/lib/api";
import { Card, COLORS, OG_CONTENT_TYPE, OG_SIZE, ogFonts } from "@/lib/og";

export const alt = "Σωματείο";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const fonts = await ogFonts();
  const { slug } = await params;

  let name = "Σωματείο";
  let footer: string | undefined;

  try {
    const team = await api.getTeam(slug);
    name = team.name;
    footer = [
      team.founded_year ? `από το ${team.founded_year}` : null,
      team.seasons?.length ? `${team.seasons.length} περίοδοι στο αρχείο` : null,
    ]
      .filter(Boolean)
      .join(" · ");
  } catch {
    // keep the fallback
  }

  return new ImageResponse(
    (
      <Card footer={footer}>
        <div
          style={{
            display: "flex",
            fontSize: name.length > 26 ? 58 : 76,
            fontWeight: 700,
            lineHeight: 1.1,
          }}
        >
          {name}
        </div>
        <div style={{ display: "flex", fontSize: 34, color: COLORS.canvas, opacity: 0.85 }}>
          ΕΠΣ Ηπείρου
        </div>
      </Card>
    ),
    { ...size, fonts },
  );
}
