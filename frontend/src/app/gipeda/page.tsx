import type { Metadata } from "next";

import { Empty } from "@/components/States";
import { api } from "@/lib/api";
import type { Field } from "@/lib/types";
import pageStyles from "../page.module.css";
import styles from "./page.module.css";

export const metadata: Metadata = { title: "Γήπεδα" };

const SURFACE_LABELS: Record<string, string> = {
  grass: "Χλοοτάπητας",
  artificial: "Συνθετικός",
  dirt: "Χωμάτινο",
};

/** Directions open in whatever map app the reader already uses, rather than us
 *  shipping a tile provider and its licence for a list of forty pitches. */
function directionsUrl(field: Field): string | null {
  if (field.latitude && field.longitude) {
    return `https://www.google.com/maps/search/?api=1&query=${field.latitude},${field.longitude}`;
  }
  const query = [field.name, field.city].filter(Boolean).join(", ");
  return query
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
    : null;
}

function FieldCard({ field }: { field: Field }) {
  const href = directionsUrl(field);
  const facts = [
    field.capacity ? `${field.capacity} θέσεις` : null,
    field.surface ? SURFACE_LABELS[field.surface] : null,
    field.has_floodlights === null
      ? null
      : field.has_floodlights
        ? "Προβολείς"
        : "Χωρίς προβολείς",
  ].filter(Boolean) as string[];

  return (
    <article className={styles.card}>
      <div className={styles.cardHead}>
        <h2 className={styles.name}>{field.name}</h2>
        {field.city && <p className={styles.city}>{field.city}</p>}
      </div>

      {facts.length > 0 && (
        <ul className={styles.facts}>
          {facts.map((fact) => (
            <li key={fact} className={styles.fact}>
              {fact}
            </li>
          ))}
        </ul>
      )}

      {href && (
        <a
          className={styles.directions}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
        >
          Οδηγίες →
        </a>
      )}
    </article>
  );
}

export default async function FieldsPage() {
  const fields = await api.listFields();

  return (
    <div className={pageStyles.page}>
      <div className={pageStyles.titleBlock}>
        <h1>Γήπεδα</h1>
        <p className={styles.subtitle}>
          {fields.length} {fields.length === 1 ? "γήπεδο" : "γήπεδα"} της ένωσης.
        </p>
      </div>

      {fields.length > 0 ? (
        <div className={styles.grid}>
          {fields.map((field) => (
            <FieldCard key={field.id} field={field} />
          ))}
        </div>
      ) : (
        <Empty
          title="Κανένα γήπεδο"
          body="Δεν έχουν καταχωρηθεί γήπεδα για αυτή την ένωση."
        />
      )}
    </div>
  );
}
