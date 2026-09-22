import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** iOS ignores SVG favicons and an unspecified apple-touch-icon becomes a
 *  screenshot of the page, which at that size is a grey smear. */
export default function AppleIcon() {
  return new ImageResponse(<Mark />, size);
}

export function Mark() {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#003c71",
      }}
    >
      <svg viewBox="0 0 104 92" width="120" height="106">
        <g fill="#ffffff">
          <rect x="6" y="6" width="92" height="11" />
          <rect x="6" y="6" width="11" height="86" />
          <rect x="87" y="6" width="11" height="86" />
        </g>
        <path
          d="M31 17V92 M46 17V92 M61 17V92 M76 17V92 M17 32H87 M17 52H87 M17 72H87"
          stroke="#ffffff"
          strokeWidth="1.4"
          opacity=".4"
          fill="none"
        />
      </svg>
    </div>
  );
}
