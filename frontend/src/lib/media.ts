import { API_URL } from "./api";

/** An uploaded image's address, from the path the API stores.
 *
 *  The API keeps "/api/media/…" rather than a full URL, so the same row works
 *  whatever host serves it. The browser is what loads the image, so it gets
 *  the public API address — never the internal one a server component uses.
 *  A full URL (a logo typed in by hand before uploads existed) passes through.
 */
export function mediaUrl(path: string): string;
export function mediaUrl(path: string | null | undefined): string | null;
export function mediaUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (/^https?:\/\//.test(path)) return path;
  return `${API_URL.replace(/\/$/, "")}${path}`;
}

/** Black or white, whichever reads on this background.
 *
 *  WCAG relative luminance, and the crossover where both inks have the same
 *  contrast (about 0.18) rather than the midpoint: a mid-green like the
 *  federation's own reads better with white, which a 0.5 split would miss.
 */
export function inkOn(hex: string): "#ffffff" | "#111111" {
  const channel = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const luminance = 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
  return luminance > 0.18 ? "#111111" : "#ffffff";
}
