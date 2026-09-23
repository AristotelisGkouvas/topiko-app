import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** iOS ignores SVG favicons and an unspecified apple-touch-icon becomes a
 *  screenshot of the page, which at that size is a grey smear. */
export default function AppleIcon() {
  return new ImageResponse(<Mark />, size);
}

export function Mark() {
  // The same grass, halfway line and centre spot as the other icons — drawn
  // as flat boxes because Satori renders no gradients and no border-radius on
  // a circle of this kind.
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
      }}
    >
      <div style={{ display: "flex", position: "absolute", inset: 0 }}>
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            style={{
              display: "flex",
              width: 36,
              height: 180,
              background: i % 2 === 0 ? "#128c40" : "#0f7e39",
            }}
          />
        ))}
      </div>
      <div
        style={{
          display: "flex",
          position: "absolute",
          left: 32,
          top: 88,
          width: 116,
          height: 4,
          background: "#ffffff",
        }}
      />
      <div
        style={{
          display: "flex",
          position: "absolute",
          left: 71,
          top: 71,
          width: 38,
          height: 38,
          borderRadius: 19,
          background: "#ffffff",
        }}
      />
    </div>
  );
}
