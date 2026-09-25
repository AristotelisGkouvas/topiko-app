"use client";

import { useEffect, useRef, useState } from "react";

import { mediaUrl } from "@/lib/media";
import type { TeamPhoto } from "@/lib/types";
import styles from "./Gallery.module.css";

/** A club's photos: a grid of thumbnails, and the full image in a dialog.
 *
 *  A <dialog> rather than a hand-made overlay: it traps focus, closes on Esc
 *  and hands focus back to the thumbnail by itself. Arrow keys and the two
 *  buttons step through; the thumbnails are the small WebPs, so a gallery of
 *  twenty costs a reader on 3G a few hundred kilobytes, not twenty photos.
 */
export function Gallery({ photos, name }: { photos: TeamPhoto[]; name: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [index, setIndex] = useState<number | null>(null);

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (index !== null && !el.open) el.showModal();
    if (index === null && el.open) el.close();
  }, [index]);

  const step = (by: number) =>
    setIndex((i) => (i === null ? i : (i + by + photos.length) % photos.length));

  const shown = index === null ? null : photos[index];

  return (
    <>
      <ul className={styles.grid}>
        {photos.map((photo, i) => (
          <li key={photo.id}>
            <button
              type="button"
              className={styles.thumb}
              onClick={() => setIndex(i)}
              aria-label={photo.caption ?? `Φωτογραφία ${i + 1} από ${photos.length}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- a
                  480px WebP from the API; nothing left to optimise. */}
              <img
                src={mediaUrl(photo.thumb_url)}
                alt=""
                loading="lazy"
                decoding="async"
                width={photo.width}
                height={photo.height}
              />
            </button>
          </li>
        ))}
      </ul>

      <dialog
        ref={dialog}
        className={styles.dialog}
        aria-label={`Φωτογραφίες, ${name}`}
        onClose={() => setIndex(null)}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") step(1);
          if (e.key === "ArrowLeft") step(-1);
        }}
        // A click on the backdrop lands on the dialog itself.
        onClick={(e) => {
          if (e.target === e.currentTarget) setIndex(null);
        }}
      >
        {shown && (
          <figure className={styles.figure}>
            {/* eslint-disable-next-line @next/next/no-img-element -- see above */}
            <img
              src={mediaUrl(shown.url)}
              alt={shown.caption ?? ""}
              width={shown.width}
              height={shown.height}
            />
            <figcaption className={styles.caption}>
              <span>{shown.caption}</span>
              <span className={styles.count}>
                {(index ?? 0) + 1} / {photos.length}
              </span>
            </figcaption>
          </figure>
        )}
        <div className={styles.controls}>
          {photos.length > 1 && (
            <>
              <button type="button" className={styles.control} onClick={() => step(-1)} aria-label="Προηγούμενη">
                ‹
              </button>
              <button type="button" className={styles.control} onClick={() => step(1)} aria-label="Επόμενη">
                ›
              </button>
            </>
          )}
          <button type="button" className={styles.control} onClick={() => setIndex(null)} aria-label="Κλείσιμο">
            ✕
          </button>
        </div>
      </dialog>
    </>
  );
}
