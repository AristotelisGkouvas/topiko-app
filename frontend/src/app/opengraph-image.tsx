import { ImageResponse } from "next/og";

import { Card, COLORS, OG_CONTENT_TYPE, OG_SIZE, ogFonts } from "@/lib/og";

export const alt = "Πάμε Σέντρα — ερασιτεχνικό ποδόσφαιρο Ηπείρου";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image() {
  return new ImageResponse(
    (
      <Card footer="Αποτελέσματα · Βαθμολογίες · Γήπεδα">
        <div style={{ display: "flex", fontSize: 84, fontWeight: 700, lineHeight: 1.1 }}>
          Πάμε Σέντρα
        </div>
        <div style={{ display: "flex", fontSize: 34, color: COLORS.canvas, opacity: 0.85 }}>
          Ερασιτεχνικό ποδόσφαιρο, ΕΠΣ Ηπείρου
        </div>
      </Card>
    ),
    { ...size, fonts: await ogFonts() },
  );
}
