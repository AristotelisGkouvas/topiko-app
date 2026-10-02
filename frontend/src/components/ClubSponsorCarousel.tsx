"use client";

import { useEffect, useRef, useState } from "react";

import styles from "./ClubSponsorCarousel.module.css";

export interface SponsorCard {
  id: number;
  name: string;
  logo: string | null;
  /** The click-counting redirect, when the sponsor has a site. */
  href: string | null;
  /** The site's host, as the card's second line. */
  site: string | null;
}

/** A club's sponsors as cards in a row (the design's "Χορηγοί ομάδας"):
 *  as many as fit, the first marked as the main sponsor. When there are more
 *  than fit, it steps along by itself every three seconds — held still under
 *  a pointer or keyboard focus, and not at all for readers who asked for less
 *  motion — with arrows to step by hand. */
export function ClubSponsorCarousel({ cards }: { cards: SponsorCard[] }) {
  const viewport = useRef<HTMLDivElement>(null);
  const [overflows, setOverflows] = useState(false);
  const [held, setHeld] = useState(false);

  useEffect(() => {
    const el = viewport.current;
    if (!el) return;
    const measure = () => setOverflows(el.scrollWidth > el.clientWidth + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!overflows || held) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => step(1), 3000);
    return () => window.clearInterval(timer);
  }, [overflows, held]);

  function step(direction: 1 | -1) {
    const el = viewport.current;
    if (!el) return;
    const card = el.querySelector("li");
    const by = card ? card.getBoundingClientRect().width + 12 : el.clientWidth;
    const end = el.scrollWidth - el.clientWidth;
    // Past either end it wraps round, so the row never stops on its own.
    if (direction > 0 && el.scrollLeft >= end - 2) el.scrollTo({ left: 0, behavior: "smooth" });
    else if (direction < 0 && el.scrollLeft <= 2) el.scrollTo({ left: end, behavior: "smooth" });
    else el.scrollBy({ left: by * direction, behavior: "smooth" });
  }

  return (
    <div className={styles.wrap}>
      {overflows && (
        <div className={styles.arrows}>
          <button type="button" className={styles.arrow} onClick={() => step(-1)} aria-label="Προηγούμενος χορηγός">
            ‹
          </button>
          <button type="button" className={styles.arrow} onClick={() => step(1)} aria-label="Επόμενος χορηγός">
            ›
          </button>
        </div>
      )}
      <div
        ref={viewport}
        className={styles.viewport}
        onMouseEnter={() => setHeld(true)}
        onMouseLeave={() => setHeld(false)}
        onFocus={() => setHeld(true)}
        onBlur={() => setHeld(false)}
        onTouchStart={() => setHeld(true)}
      >
        <ul className={styles.track}>
          {cards.map((s, i) => {
            const body = (
              <>
                <span className={styles.logoBox}>
                  {s.logo ? (
                    // eslint-disable-next-line @next/next/no-img-element -- a small WebP from the API
                    <img src={s.logo} alt="" className={styles.logo} loading="lazy" decoding="async" />
                  ) : (
                    <span className={styles.logoWord} aria-hidden="true">
                      {s.name}
                    </span>
                  )}
                </span>
                <span className={styles.text}>
                  {i === 0 && cards.length > 1 && <span className={styles.main}>ΚΥΡΙΟΣ ΧΟΡΗΓΟΣ</span>}
                  <span className={styles.name}>{s.name}</span>
                  {s.site && <span className={styles.site}>{s.site}</span>}
                </span>
              </>
            );
            return (
              <li key={s.id} className={`${styles.card} ${i === 0 && cards.length > 1 ? styles.first : ""}`}>
                {s.href ? (
                  <a href={s.href} target="_blank" rel="sponsored noopener" className={styles.inner}>
                    {body}
                  </a>
                ) : (
                  <span className={styles.inner}>{body}</span>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
