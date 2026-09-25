"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type { Field } from "@/lib/types";
import styles from "./VenueMap.module.css";
import { plural } from "@/lib/format";

/** Grounds on a map.
 *
 *  Leaflet driven directly rather than through react-leaflet: that wrapper
 *  still pins React 18, and a map is a handful of imperative calls anyway —
 *  not worth carrying a dependency whose compatibility has to be tracked.
 *
 *  Tiles come from OpenStreetMap, which is free and asks for attribution in
 *  return. The attribution is not decoration; it is the licence.
 */
export function VenueMap({ fields }: { fields: Field[] }) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<import("leaflet").Map | null>(null);
  // Loaded on a tap, not on arrival: the tiles are ~190 KB on every cold
  // visit, a real cost on a 2 GB/month plan, and OpenStreetMap's tile policy
  // asks sites not to pull tiles nobody looks at.
  const [open, setOpen] = useState(false);

  // Memoised: it is the effect's dependency, and a fresh array every render
  // would tear the map down and rebuild it whenever the parent re-renders.
  const located = useMemo(
    () => fields.filter((f) => f.latitude !== null && f.longitude !== null),
    [fields],
  );

  useEffect(() => {
    if (!open || !container.current || located.length === 0) return;

    let cancelled = false;

    // Imported here, not at module scope: Leaflet reaches for `window` as it
    // loads, which on the server is a crash rather than a warning.
    void import("leaflet").then((L) => {
      if (cancelled || !container.current || map.current) return;

      const instance = L.map(container.current, {
        scrollWheelZoom: false, // a map that eats the page scroll on a phone
      });
      map.current = instance;

      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 18,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(instance);

      // Drawn in CSS rather than Leaflet's default PNGs, which the bundler
      // does not serve: the stock marker came up as a broken image.
      const pin = L.divIcon({
        className: styles.pin,
        html: "<span></span>",
        iconSize: [26, 26],
        iconAnchor: [13, 26],
        popupAnchor: [0, -24],
        tooltipAnchor: [0, -20],
      });

      const points: [number, number][] = [];
      for (const field of located) {
        const lat = Number(field.latitude);
        const lng = Number(field.longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
        points.push([lat, lng]);

        const label = [field.name, field.city].filter(Boolean).join(" · ");
        L.marker([lat, lng], { icon: pin })
          .addTo(instance)
          .bindPopup(
            `<strong>${escapeHtml(field.name)}</strong>` +
              (field.city ? `<br>${escapeHtml(field.city)}` : "") +
              `<br><a href="https://www.google.com/maps/search/?api=1&query=${lat},${lng}" target="_blank" rel="noreferrer">Οδηγίες</a>`,
          )
          .bindTooltip(label);
      }

      if (points.length === 1) instance.setView(points[0], 14);
      else if (points.length > 1) {
        instance.fitBounds(points, { padding: [30, 30] });
      }
    });

    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
    };
  }, [located, open]);

  if (located.length === 0) return null;

  if (!open) {
    return (
      <button type="button" className={styles.reveal} onClick={() => setOpen(true)}>
        Εμφάνιση χάρτη ({located.length}{" "}
        {plural(located.length, "γήπεδο", "γήπεδα")})
      </button>
    );
  }

  return (
    <div
      ref={container}
      className={styles.map}
      // Without a role a div full of tiles is announced as nothing at all.
      role="img"
      aria-label={`Χάρτης με ${located.length} ${plural(located.length, "γήπεδο", "γήπεδα")}`}
    />
  );
}

/** Popup content is built as an HTML string, which is Leaflet's API — so the
 *  two fields that come from the database are escaped rather than trusted. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
