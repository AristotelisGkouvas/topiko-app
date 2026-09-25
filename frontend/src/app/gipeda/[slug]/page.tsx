import "leaflet/dist/leaflet.css";

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Crest } from "@/components/Crest";
import { FixtureRow } from "@/components/MatchCard";
import { ShareButton } from "@/components/ShareButton";
import { VenueMap } from "@/components/VenueMap";
import { ApiError, api } from "@/lib/api";
import type { FieldDetail } from "@/lib/types";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

const SURFACE_LABELS: Record<string, string> = {
  grass: "Χλοοτάπητας",
  artificial: "Συνθετικός χλοοτάπητας",
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
      description: tenants ? `Έδρα: ${tenants}.` : "Γήπεδο της ένωσης.",
    };
  } catch {
    // A missing ground is handled by the page itself; metadata is not the
    // place to throw, and a generic title beats a failed render.
    return { title: "Γήπεδο" };
  }
}

/** Directions from coordinates when we have them, from the name when we do not.
 *  The federation publishes neither, so in practice this is the name — which is
 *  still enough for a maps app to find a village pitch. */
function directionsUrl(field: FieldDetail): string | null {
  if (field.latitude && field.longitude) {
    return `https://www.google.com/maps/search/?api=1&query=${field.latitude},${field.longitude}`;
  }
  const query = [field.name, field.city, field.address].filter(Boolean).join(", ");
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

  const tenants = field.home_teams.map((team) => team.name);
  const located = field.latitude !== null && field.longitude !== null;

  /** Label/value rows, in the design's order. Anything the register left blank
   *  is dropped rather than printed as "—": a row that says nothing takes the
   *  same space as one that says something. */
  const facts: { label: string; value: string }[] = [];
  if (field.surface) {
    facts.push({ label: "Επιφάνεια", value: SURFACE_LABELS[field.surface] });
  }
  if (field.has_floodlights !== null) {
    facts.push({
      label: "Προβολείς",
      value: field.has_floodlights ? "Ναι" : "Όχι",
    });
  }
  if (field.capacity) {
    facts.push({ label: "Χωρητικότητα", value: `${field.capacity} θέσεις` });
  }
  if (tenants.length > 0) {
    facts.push({ label: "Έδρα", value: tenants.join(" και ") });
  }
  const address = [field.address, field.postal_code, field.city]
    .filter(Boolean)
    .join(", ");
  if (address) facts.push({ label: "Διεύθυνση", value: address });

  const directions = directionsUrl(field);

  return (
    <div className={styles.page}>
      {/* The design opens on a 190px band. With coordinates it is the map;
          without, the hatch the design itself draws — which is honest, since
          the federation publishes no photographs either. */}
      <div className={styles.banner}>
        {located ? (
          <VenueMap fields={[field]} />
        ) : (
          <div className={styles.hatch} aria-hidden="true" />
        )}
      </div>

      <div className={styles.titleBlock}>
        <h1 className={styles.name}>{field.name}</h1>
        <p className={styles.sub}>
          {[field.city, tenants.length > 0 ? `έδρα του ${tenants[0]}` : null]
            .filter(Boolean)
            .join(" · ") || "Γήπεδο της ένωσης"}
        </p>
      </div>

      <div className={styles.body}>
        {facts.length > 0 && (
          <dl className={styles.facts}>
            {facts.map((fact) => (
              <div key={fact.label} className={styles.fact}>
                <dt className={styles.factLabel}>{fact.label}</dt>
                <dd className={styles.factValue}>{fact.value}</dd>
              </div>
            ))}
          </dl>
        )}

        <div className={styles.actions}>
          {directions && (
            <a
              className={styles.primary}
              href={directions}
              target="_blank"
              rel="noopener noreferrer"
            >
              Οδηγίες
            </a>
          )}
          <ShareButton title={field.name} className={styles.secondary} />
        </div>

        {!located && (
          <p className={styles.noPin}>
            Το γήπεδο δεν έχει ακόμη θέση στον χάρτη. Οι οδηγίες ψάχνουν το
            όνομα — η θέση συμπληρώνεται από τη{" "}
            <Link href="/diaxeirisi">διαχείριση</Link>.
          </p>
        )}

        {field.home_teams.length > 0 && (
          <section className={styles.group}>
            <p className={styles.groupLabel}>ΣΩΜΑΤΕΙΑ ΜΕ ΕΔΡΑ ΕΔΩ</p>
            <div className={styles.card}>
              {field.home_teams.map((team, i) => (
                <Link
                  key={team.slug}
                  href={`/somateia/${team.slug}`}
                  className={`${styles.row} ${
                    i === field.home_teams.length - 1 ? styles.rowLast : ""
                  }`}
                >
                  <Crest team={team} size="sm" />
                  <span className={styles.rowName}>{team.name}</span>
                  <span className={styles.chevron} aria-hidden="true">
                    ›
                  </span>
                </Link>
              ))}
            </div>
          </section>
        )}

        <section className={styles.group}>
          <p className={styles.groupLabel}>ΑΓΩΝΕΣ ΕΔΩ</p>
          {matches.length === 0 ? (
            <div className={styles.card}>
              <p className={styles.none}>
                Δεν έχει οριστεί αγώνας σε αυτό το γήπεδο για τη φετινή σεζόν.
              </p>
            </div>
          ) : (
            <div className={styles.card}>
              {matches.map((match) => (
                <FixtureRow key={match.id} match={match} />
              ))}
            </div>
          )}
        </section>

        {field.notes && <p className={styles.notes}>{field.notes}</p>}
      </div>
    </div>
  );
}
