"use client";

import { useEffect, useState } from "react";

import { INTRO_KEY } from "@/lib/introBoot";
import styles from "./Intro.module.css";

/** The opening splash, from "Pame Sentra Intro": the pitch is mown in
 *  stripes, the ball rolls onto the halfway line and the wordmark rises.
 *
 *  Once per browser session, and only on the home page — a match link opened
 *  from Viber goes straight to the match. The whole timeline, fade-out
 *  included, is CSS, so it ends on time even while the page is still
 *  hydrating; JavaScript only records that it was seen and lets a tap or a key
 *  skip it. Readers who ask for reduced motion never see it (the CSS hides it).
 */
export function Intro() {
  const [state, setState] = useState<"playing" | "leaving" | "gone">(
    "playing",
  );

  useEffect(() => {
    try {
      sessionStorage.setItem(INTRO_KEY, "1");
    } catch {
      // Private mode: it plays again next time, which is harmless.
    }
  }, []);

  useEffect(() => {
    if (state !== "playing") return;
    const skip = () => setState("leaving");
    window.addEventListener("keydown", skip);
    return () => window.removeEventListener("keydown", skip);
  }, [state]);

  if (state === "gone") return null;

  const done = (event: React.AnimationEvent) => {
    // Every stripe and word ends an animation of its own and they bubble up
    // here; only the overlay's own fade-out means it is over.
    if (event.target !== event.currentTarget) return;
    if (!event.animationName.includes("out")) return;
    // Client-side navigation back to the home page must not replay it.
    document.documentElement.setAttribute("data-intro", "seen");
    setState("gone");
  };

  return (
    <div
      className={`${styles.intro} ${state === "leaving" ? styles.leaving : ""}`}
      onClick={() => setState("leaving")}
      onAnimationEnd={done}
      aria-hidden="true"
    >
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <span
          key={i}
          className={styles.stripe}
          style={{
            left: `${(2 * i + 1) * 10}vw`,
            transformOrigin: i % 2 ? "bottom" : "top",
            animationDelay: `${i * 0.05}s`,
          }}
        />
      ))}
      <div className={styles.stage}>
        <div className={styles.mark}>
          <span className={styles.pame}>ΠΑΜΕ</span>
          <span className={styles.sentra}>ΣΕΝΤΡΑ</span>
          <span className={styles.line}>
            <span className={`${styles.rule} ${styles.ruleLeft}`} />
            <span className={styles.ball} />
            <span className={`${styles.rule} ${styles.ruleRight}`} />
          </span>
          <span className={styles.tagline}>ΤΟΠΙΚΟ ΠΟΔΟΣΦΑΙΡΟ</span>
        </div>
      </div>
    </div>
  );
}
