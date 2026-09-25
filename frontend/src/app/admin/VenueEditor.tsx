"use client";

import { useState } from "react";
import useSWR from "swr";

import { Empty } from "@/components/States";
import { ApiError } from "@/lib/api";
import { editorApi } from "@/lib/editorApi";
import type { Field } from "@/lib/types";
import { noteAuthError } from "./session";
import styles from "./page.module.css";

/** Filling in the grounds.
 *
 *  This is the only route by which a venue gets coordinates — the federation
 *  publishes a surface and a floodlight flag and nothing that locates the
 *  place — so the list leads with the ones still missing a pin.
 */
export function VenueEditor() {
  const { data, error, isLoading, mutate } = useSWR<Field[]>(
    "editor:fields",
    () => editorApi.fields(),
  );
  const [query, setQuery] = useState("");

  if (isLoading) return <p className={styles.loading}>Φόρτωση γηπέδων…</p>;
  if (error) return <Empty title="Δεν φορτώθηκαν τα γήπεδα" />;

  const needle = query.trim().toLowerCase();
  const shown = (data ?? [])
    .filter((f) => !needle || f.name.toLowerCase().includes(needle))
    .sort((a, b) => {
      const pinned = Number(a.latitude !== null) - Number(b.latitude !== null);
      return pinned !== 0 ? pinned : a.name.localeCompare(b.name, "el");
    });

  const missing = (data ?? []).filter((f) => f.latitude === null).length;

  return (
    <>
      <div className={styles.filters}>
        <input
          className={styles.input}
          placeholder="Αναζήτηση γηπέδου…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Αναζήτηση γηπέδου"
        />
        <span className={styles.counter}>
          {missing} χωρίς συντεταγμένες
        </span>
      </div>

      <ul className={styles.rows}>
        {shown.slice(0, 40).map((field) => (
          <VenueRow key={field.id} field={field} onSaved={() => mutate()} />
        ))}
      </ul>
    </>
  );
}

/** A coordinate as typed, or undefined when it is not a number at all.
 *
 *  A Greek keyboard types "39,6683". Number() makes that NaN, JSON makes NaN
 *  null, and the pin was wiped without a word. */
function coordinate(raw: string | number): number | null | undefined {
  const text = String(raw).trim().replace(",", ".");
  if (text === "") return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : undefined;
}

function VenueRow({ field, onSaved }: { field: Field; onSaved: () => void }) {
  const [lat, setLat] = useState(field.latitude ?? "");
  const [lng, setLng] = useState(field.longitude ?? "");
  const [city, setCity] = useState(field.city ?? "");
  const [name, setName] = useState(field.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const latitude = coordinate(lat);
    const longitude = coordinate(lng);
    if (latitude === undefined || longitude === undefined) {
      setError("Οι συντεταγμένες πρέπει να είναι αριθμοί, π.χ. 39.6683.");
      return;
    }
    if (
      (latitude !== null && Math.abs(latitude) > 90) ||
      (longitude !== null && Math.abs(longitude) > 180)
    ) {
      setError("Εκτός ορίων: πλάτος έως ±90, μήκος έως ±180.");
      return;
    }
    if (name.trim().length < 2) {
      setError("Το όνομα του γηπέδου χρειάζεται τουλάχιστον δύο γράμματα.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await editorApi.saveField(field.slug, {
        latitude,
        longitude,
        city: city.trim() || null,
        // Only when changed: the audit log should not record a rename that
        // did not happen every time a pin is placed.
        ...(name.trim() !== field.name ? { name: name.trim() } : {}),
      });
      onSaved();
    } catch (err) {
      noteAuthError(err);
      setError(err instanceof ApiError ? err.message : "Απέτυχε.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className={styles.venueRow}>
      <div className={styles.venueHead}>
        <span className={styles.venueName}>{field.name}</span>
        {field.latitude === null && (
          <span className={styles.missing}>χωρίς πινέζα</span>
        )}
      </div>

      <div className={styles.venueFields}>
        <input
          className={styles.small}
          placeholder="Όνομα γηπέδου"
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label={`Όνομα γηπέδου, ${field.name}`}
        />
        <input
          className={styles.small}
          placeholder="Γεωγρ. πλάτος"
          inputMode="decimal"
          value={lat}
          onChange={(e) => setLat(e.target.value)}
          aria-label={`Γεωγραφικό πλάτος, ${field.name}`}
        />
        <input
          className={styles.small}
          placeholder="Γεωγρ. μήκος"
          inputMode="decimal"
          value={lng}
          onChange={(e) => setLng(e.target.value)}
          aria-label={`Γεωγραφικό μήκος, ${field.name}`}
        />
        <input
          className={styles.small}
          placeholder="Πόλη / χωριό"
          value={city}
          onChange={(e) => setCity(e.target.value)}
          aria-label={`Τοποθεσία, ${field.name}`}
        />
        <button
          type="button"
          className={styles.save}
          disabled={busy}
          onClick={save}
        >
          {busy ? "…" : "Αποθήκευση"}
        </button>
      </div>

      {/* The map is the check: a transposed pair lands in the sea, and seeing
          that takes a second where reading two decimals does not. */}
      {lat !== "" && lng !== "" && (
        <a
          className={styles.preview}
          href={`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`}
          target="_blank"
          rel="noreferrer noopener"
        >
          Έλεγχος στον χάρτη →
        </a>
      )}

      {error && (
        <span className={styles.rowError} role="alert">
          {error}
        </span>
      )}
    </li>
  );
}
