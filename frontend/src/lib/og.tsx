import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { api } from "./api";
import { mediaUrl } from "./media";

/** OpenGraph's expected aspect ratio, and what every social preview crops to. */
export const OG_SIZE = { width: 1200, height: 630 };
export const OG_CONTENT_TYPE = "image/png";

/** Read once per process rather than per request — these are ~600KB each. */
const fontFile = (name: string) =>
  readFile(join(process.cwd(), "assets", name));

let cached: Promise<Buffer[]> | null = null;

/** The two families the brand uses, in the weights the cards need.
 *
 *  Satori ships no font of its own and falls back to nothing, so every Greek
 *  letter renders as an empty box without this — a failure that is invisible
 *  in the page and only shows up once somebody pastes the link into Viber.
 *
 *  Fira Sans Condensed carries the headings, names and numbers, as it does
 *  everywhere else; Noto Sans carries the prose. Both are vendored as TTF
 *  rather than pulled through `next/font`, which caches woff2 that Satori
 *  cannot read.
 */
export async function ogFonts() {
  cached ??= Promise.all([
    fontFile("NotoSans-Regular.ttf"),
    fontFile("NotoSans-Bold.ttf"),
    fontFile("FiraSansCondensed-SemiBold.ttf"),
    fontFile("FiraSansCondensed-Bold.ttf"),
    fontFile("FiraSansCondensed-ExtraBold.ttf"),
  ]);

  const [noto, notoBold, fira600, fira700, fira800] = await cached;
  const normal = "normal" as const;
  return [
    { name: "Noto Sans", data: noto, weight: 400 as const, style: normal },
    { name: "Noto Sans", data: notoBold, weight: 700 as const, style: normal },
    { name: DISPLAY, data: fira600, weight: 600 as const, style: normal },
    { name: DISPLAY, data: fira700, weight: 700 as const, style: normal },
    { name: DISPLAY, data: fira800, weight: 800 as const, style: normal },
  ];
}

/** The display family's name, as Satori will know it. */
export const DISPLAY = "Fira Sans Condensed";

export const COLORS = {
  navy: "#003c71",
  navyLine: "#0a4f8c",
  green: "#128c40",
  //: The darker stripe of the mown-grass mark, used only beside `green`.
  grassDark: "#0f7e39",
  greenLight: "#4fd07c",
  ink: "#3a3a3a",
  muted: "#6c6f72",
  onNavy: "#f5f5f5",
  onNavyMuted: "#9cb6ce",
  surface: "#ffffff",
  canvas: "#f4f5f6",
};

/** The grass band the social cards use as a header, as a CSS value.
 *
 *  Satori has no `repeating-linear-gradient`, so the stripes are a plain
 *  `linear-gradient` with hard stops repeated by hand. Wider stripes than the
 *  app's mark because the card is 1200px across and the mark is 32.
 */
export function grass(stripe = 60): string {
  const stops: string[] = [];
  for (let x = 0; x < 1200; x += stripe * 2) {
    stops.push(
      `${COLORS.green} ${x}px`,
      `${COLORS.green} ${x + stripe}px`,
      `${COLORS.grassDark} ${x + stripe}px`,
      `${COLORS.grassDark} ${x + stripe * 2}px`,
    );
  }
  return `linear-gradient(90deg, ${stops.join(", ")})`;
}

/** The frame every card shares: navy ground, the wordmark, and a strip of
 *  colour along the bottom so a thumbnail is recognisable at any size. */
/** A platform sponsor as a share image draws it. */
export interface ShareSponsor {
  name: string;
  src: string;
}

/** The sponsors who bought the share images: up to four, those with a PNG
 *  logo (the renderer cannot read WebP). Never throws — a card with no
 *  sponsors beats a card that failed to render. */
export async function shareSponsors(): Promise<ShareSponsor[]> {
  const list = await api.listPlatformSponsors("share").catch(() => []);
  return list
    .filter((s) => s.logo_png_url)
    .slice(0, 4)
    .map((s) => ({ name: s.name, src: mediaUrl(s.logo_png_url!) }));
}

/** Logos on white plates, in a row. White on the navy card too: logos are
 *  drawn for white paper. Satori needs every image's size spelled out. */
export function SponsorRow({
  sponsors,
  height = 56,
}: {
  sponsors: ShareSponsor[];
  height?: number;
}) {
  if (sponsors.length === 0) return null;
  const width = Math.round(height * 2.6);
  return (
    <div style={{ display: "flex", gap: 10 }}>
      {sponsors.map((s) => (
        <div
          key={s.src}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width,
            height,
            padding: 5,
            borderRadius: 8,
            background: "#ffffff",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- Satori renders <img>, not next/image */}
          <img
            src={s.src}
            alt={s.name}
            width={width - 10}
            height={height - 10}
            style={{ objectFit: "contain" }}
          />
        </div>
      ))}
    </div>
  );
}

export function Card({
  children,
  footer,
  sponsors = [],
  sponsorHeight = 56,
}: {
  children: React.ReactNode;
  footer?: string;
  /** From shareSponsors(): drawn on the right of the footer line. */
  sponsors?: ShareSponsor[];
  /** Plate height. 56 on a 1200px card; bigger on the tall story, where the
   *  same 44 came out at 16px on a phone and could not be read. */
  sponsorHeight?: number;
}) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: COLORS.navy,
        color: COLORS.surface,
        fontFamily: "Noto Sans",
        padding: 56,
        position: "relative",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        {/* The grass mark. Satori has no gradients, so the stripes are drawn
            as what they are: alternating bars. */}
        <div style={{ display: "flex", width: 56, height: 56, borderRadius: 12, overflow: "hidden" }}>
          {[0, 1, 2, 3, 4].map((i) => (
            <div
              key={i}
              style={{
                display: "flex",
                width: 11.2,
                height: 56,
                background: i % 2 === 0 ? COLORS.green : COLORS.grassDark,
              }}
            />
          ))}
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 24,
            letterSpacing: 3,
            fontWeight: 700,
            opacity: 0.85,
          }}
        >
          ΠΑΜΕ ΣΕΝΤΡΑ
        </div>
      </div>

      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          gap: 18,
        }}
      >
        {children}
      </div>

      {(footer || sponsors.length > 0) && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 20,
          }}
        >
          <div style={{ display: "flex", fontSize: 24, opacity: 0.75 }}>{footer ?? ""}</div>
          <SponsorRow sponsors={sponsors} height={sponsorHeight} />
        </div>
      )}

      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: 12,
          display: "flex",
          background: COLORS.green,
        }}
      />
    </div>
  );
}
