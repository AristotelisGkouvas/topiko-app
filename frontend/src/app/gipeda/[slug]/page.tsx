import "leaflet/dist/leaflet.css";

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Crest } from "@/components/Crest";
import { MatchGrid } from "@/components/MatchGrid";
import { SectionHeader } from "@/components/SectionHeader";
import { VenueMap } from "@/components/VenueMap";
import { ApiError, api } from "@/lib/api";
import type { FieldDetail } from "@/lib/types";
import pageStyles from "../../page.module.css";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

const SURFACE_LABELS: Record<string, string> = {
  grass: "Χλοοτάπητας",
  artificial: "Συνθετικός",
  dirt: "Χωμάτινο",
};

async function load(slug: string): Promise<FieldDetail> {
  try {
    return await api.getField(slug);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  try {
    const field = await api.getField(slug);
    const tenants = field.home_teams.map((t) => t.name).join(", ");
    return {
      title: field.name,
      description: tenants ? `Έδρα: ${tenants}.` : `Γήπεδο της ένωσης.`,
    };
  } catch {
    // A missing ground is handled by the page itself; metadata is not the
    // place to throw, and a generic title is better than a failed render.
    return { title: "Γήπεδο" };
  }
}

/** Directions, from coordinates when we have them and from the name when we
 *  do not. The federation publishes neither, so in practice this is the name
 *  — which is still enough for a maps app to find a village pitch. */
function directionsUrl(field: FieldDetail): string | null {
  if (field.latitude && field.longitude) {
    return `https://www.google.com/maps/search/?api=1&query=${field.latitude},${field.longitude}`;
  }
  const query = [field.name, field.city, field.address]
    .filter(Boolean)
    .join(", ");
  return query
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
    : null;
}

export default async function FieldPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const field = await load(slug);
  const matches = await api.getFieldMatches(slug);

  const facts: { label: string; value: string }[] = [];
  if (field.surface)
    facts.push({ label: "Επιφάνεια", value: SURFACE_LABELS[field.surface] });
  if (field.capacity)
    facts.push({ label: "Χωρητικότητα", value: `${field.capacity} θέσεις` });
  if (field.has_floodlights !== null)
    facts.push({
      label: "Προβολείς",
      value: field.has_floodlights ? "Ναι" : "Όχι",
    });
  const address = [field.address, field.postal_code, field.city]
    .filter(Boolean)
    .join(", ");
  if (address) facts.push({ label: "Διεύθυνση", value: address });

  const directions = directionsUrl(field);

  return (
    <div className={pageStyles.page}>
      <div className={pageStyles.titleBlock}>
        <p className={styles.crumb}>
          <Link href="/gipeda">Γήπεδα</Link>
        </p>
        <h1>{field.name}</h1>
        {field.home_teams.length > 0 && (
          <p className={styles.subtitle}>
            Έδρα {field.home_teams.map((team) => team.name).join(" και ")}
          </p>
        )}
      </div>

      {facts.length > 0 && (
        <dl className={styles.facts}>
          {facts.map((fact) => (
            <div key={fact.label} className={styles.fact}>
              <dt>{fact.label}</dt>
              <dd>{fact.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {directions && (
        <a
          className={styles.directions}
          href={directions}
          target="_blank"
          rel="noopener noreferrer"
        >
          Οδηγίες →
        </a>
      )}

      {/* Draws nothing without coordinates, which is every ground today. The
          note below says so rather than leaving a blank where a map was. */}
      <VenueMap fields={[field]} />
      {field.latitude === null && (
        <p className={styles.noPin}>
          Το γήπεδο δεν έχει ακόμη θέση στον χάρτη. Οι οδηγίες παραπάνω ψάχνουν
          το όνομα — συμπληρώνεται από τη <Link href="/diaxeirisi">διαχείριση</Link>.
        </p>
      )}

      {field.home_teams.length > 0 && (
        <section className={styles.section}>
          <SectionHeader title="Σωματεία με έδρα εδώ" />
          <ul className={styles.clubs}>
            {field.home_teams.map((team) => (
              <li key={team.slug}>
                <Link href={`/somateia/${team.slug}`} className={styles.club}>
                  <Crest team={team} size="sm" />
                  <span>{team.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className={styles.section}>
        <SectionHeader title="Αγώνες στο γήπεδο" />
        <MatchGrid
          matches={matches}
          empty={{
            title: "Κανένας αγώνας",
            body: "Δεν έχει οριστεί αγώνας σε αυτό το γήπεδο για τη φετινή σεζόν.",
            action: { href: "/programma", label: "Όλο το πρόγραμμα" },
          }}
        />
      </section>

      {field.notes && <p className={styles.notes}>{field.notes}</p>}
    </div>
  );
}
