import "leaflet/dist/leaflet.css";

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Crest } from "@/components/Crest";
import { BandHeader } from "@/components/BandHeader";
import { Icon } from "@/components/Icon";
import { ShareButton } from "@/components/ShareButton";
import { VenueMap } from "@/components/VenueMap";
import { ApiError, api } from "@/lib/api";
import { formatDayDate, formatTime } from "@/lib/format";
import type { FieldDetail, Match } from "@/lib/types";
import { JsonLd, absolute, breadcrumbs } from "@/lib/seo";
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
    // A ground that is home to 28 clubs listed all 28 — 500 characters a
    // search result cuts at 155. Count past three.
    const teams = field.home_teams;
    const tenants =
      teams.length > 3
        ? `${teams.slice(0, 3).map((t) => t.name).join(", ")} και ${teams.length - 3} ακόμη σωματεία`
        : teams.map((t) => t.name).join(", ");
    return {
      title: field.name,
      description: [
        field.city,
        tenants ? `Έδρα: ${tenants}` : "Γήπεδο της ένωσης",
      ]
        .filter(Boolean)
        .join(" · ") + ".",
      alternates: { canonical: `/gipeda/${slug}` },
      // A ground no club calls home is a name and a hatch — thin enough that
      // Google would count it against the ones that matter.
      ...(teams.length === 0 && { robots: { index: false, follow: true } }),
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


  const located = field.latitude !== null && field.longitude !== null;
  const directions = directionsUrl(field);
  const next = matches.find((m) => m.home_score === null && isAhead(m)) ?? null;
  const address = [field.address, field.postal_code, field.city].filter(Boolean).join(", ");

  /** Label/value rows. Anything the register left blank is dropped rather
   *  than printed as "—". */
  const facts: { label: string; value: string }[] = [];
  if (field.surface) facts.push({ label: "Επιφάνεια", value: SURFACE_LABELS[field.surface] });
  if (field.has_floodlights !== null) facts.push({ label: "Προβολείς", value: field.has_floodlights ? "Ναι" : "Όχι" });
  if (field.capacity) facts.push({ label: "Χωρητικότητα", value: `${field.capacity} θέσεις` });
  if (address) facts.push({ label: "Διεύθυνση", value: address });
  facts.push({ label: "Αγώνες φέτος", value: String(matches.length) });

  return (
    <div className={styles.page}>
      <JsonLd
        data={[
          {
            "@context": "https://schema.org",
            "@type": "StadiumOrArena",
            name: field.name,
            url: absolute(`/gipeda/${field.slug}`),
            ...((field.city || field.address) && {
              address: {
                "@type": "PostalAddress",
                ...(field.address && { streetAddress: field.address }),
                ...(field.city && { addressLocality: field.city }),
                ...(field.postal_code && { postalCode: field.postal_code }),
                addressCountry: "GR",
              },
            }),
            ...(field.latitude && field.longitude && {
              geo: { "@type": "GeoCoordinates", latitude: field.latitude, longitude: field.longitude },
            }),
            ...(field.capacity && { maximumAttendeeCapacity: field.capacity }),
          },
          breadcrumbs([
            { name: "Γήπεδα", path: "/gipeda" },
            { name: field.name, path: `/gipeda/${field.slug}` },
          ]),
        ]}
      />

      <BandHeader
        crumbs={[{ label: "Ένωση" }, { label: "Γήπεδα", href: "/gipeda" }, { label: field.name }]}
        lead={
          <span className={styles.glyph} aria-hidden="true">
            <svg viewBox="0 0 40 40" width="40" height="40">
              <rect x="4" y="9" width="32" height="22" rx="2" />
              <path d="M20 9v22" />
              <circle cx="20" cy="20" r="4.5" />
              <path d="M4 15h4v10H4M36 15h-4v10h4" />
            </svg>
          </span>
        }
        title={field.name}
        sub={
          <span className={styles.meta}>
            {field.city && <span>{field.city}</span>}
            {field.surface && (
              <span className={`${styles.tag} ${field.surface === "dirt" ? "" : styles.green}`}>
                <span className={styles.swatch} aria-hidden="true" />
                {SURFACE_LABELS[field.surface]}
              </span>
            )}
            {field.has_floodlights !== null && (
              <span className={styles.tag}>{field.has_floodlights ? "Με προβολείς" : "Χωρίς προβολείς"}</span>
            )}
          </span>
        }
        aside={
          <div className={styles.actions}>
            {directions && (
              <a className={styles.primary} href={directions} target="_blank" rel="noopener noreferrer">
                <Icon name="pin" size={17} />
                Οδηγίες
              </a>
            )}
            <ShareButton title={field.name} className={styles.square} iconOnly />
          </div>
        }
      />

      <div className={styles.body}>
        <div className={styles.main}>
          {next && <NextHere match={next} />}

          <section className={styles.block} aria-labelledby="here">
            <div className={styles.blockHead}>
              <h2 id="here" className={styles.h2}>
                Αγώνες εδώ
              </h2>
              <span className={styles.note}>Τρέχουσα περίοδος</span>
            </div>
            <div className={styles.card}>
              {matches.length === 0 ? (
                <p className={styles.none}>Δεν έχει οριστεί αγώνας σε αυτό το γήπεδο για τη φετινή σεζόν.</p>
              ) : (
                matches.map((m) => <Game key={m.id} match={m} />)
              )}
            </div>
          </section>
        </div>

        <aside className={styles.side} aria-label="Στοιχεία γηπέδου">
          {/* With coordinates, the map; without, the hatch of the design: the
              federation publishes no photographs either. */}
          <div className={styles.banner}>
            {located ? <VenueMap fields={[field]} /> : <div className={styles.hatch} aria-hidden="true" />}
          </div>

          <section className={styles.block} aria-labelledby="facts">
            <h2 id="facts" className={styles.h2}>
              Στοιχεία
            </h2>
            <div className={styles.factsCard}>
              <dl className={styles.facts}>
                {facts.map((f) => (
                  <div key={f.label}>
                    <dt>{f.label}</dt>
                    <dd>{f.value}</dd>
                  </div>
                ))}
              </dl>
              {field.notes && <p className={styles.notes}>{field.notes}</p>}
            </div>
          </section>

          {field.home_teams.length > 0 && (
            <section className={styles.block} aria-labelledby="home-of">
              <h2 id="home-of" className={styles.h2}>
                Έδρα για
              </h2>
              <div className={styles.card}>
                {field.home_teams.map((team) => (
                  <Link key={team.slug} href={`/somateia/${team.slug}`} className={styles.club}>
                    <Crest team={team} size="md" />
                    <span className={styles.clubName}>{team.name}</span>
                    <span className={styles.chevron} aria-hidden="true">
                      ›
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}

/** Still to be played: no score, and not in the past. A plain function, as
 *  it reads the clock. */
function isAhead(m: Match): boolean {
  return m.status !== "cancelled" && (m.kickoff_at === null || Date.parse(m.kickoff_at) >= Date.now() - 3 * 3600_000);
}

function NextHere({ match }: { match: Match }) {
  return (
    <section className={styles.next} aria-labelledby="next-here">
      <div className={styles.nextTop}>
        <h2 id="next-here" className={styles.nextLabel}>
          ΕΠΟΜΕΝΟΣ ΑΓΩΝΑΣ ΕΔΩ
        </h2>
        <span className={styles.nextWhen}>{formatDayDate(match.kickoff_at)}</span>
      </div>
      <Link href={`/agones/${match.id}`} className={styles.nextBoard}>
        <span className={styles.nextSide}>
          <Crest team={match.home_team} size="md" onNavy />
          <span>{match.home_team.name}</span>
        </span>
        <span className={styles.nextTime}>{formatTime(match.kickoff_at) || "–"}</span>
        <span className={`${styles.nextSide} ${styles.nextAway}`}>
          <span>{match.away_team.name}</span>
          <Crest team={match.away_team} size="md" onNavy />
        </span>
      </Link>
    </section>
  );
}

function Game({ match }: { match: Match }) {
  const hs = match.home_score;
  const as = match.away_score;
  const played = hs !== null && as !== null;
  const [day, date] = formatDayDate(match.kickoff_at).split(" ");
  return (
    <Link href={`/agones/${match.id}`} className={styles.game}>
      <span className={styles.date}>
        <span>{day ? day.charAt(0) + day.slice(1).toLocaleLowerCase("el-GR") : "—"}</span>
        <span className={styles.dateNum}>{date ?? ""}</span>
      </span>
      <span className={styles.teams}>
        <span className={played && hs! > as! ? styles.won : undefined}>
          <Crest team={match.home_team} size="xs" />
          <span>{match.home_team.name}</span>
        </span>
        <span className={played && as! > hs! ? styles.won : undefined}>
          <Crest team={match.away_team} size="xs" />
          <span>{match.away_team.name}</span>
        </span>
      </span>
      {played ? (
        <span className={styles.result}>
          <span className={styles.scores}>
            <span>{hs}</span>
            <span>{as}</span>
          </span>
          <span className={styles.final}>ΤΕΛ.</span>
        </span>
      ) : (
        <span className={styles.time}>
          {match.status === "postponed" ? "ΑΝΑΒΟΛΗ" : formatTime(match.kickoff_at) || "—"}
        </span>
      )}
    </Link>
  );
}
