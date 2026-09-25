import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/PageHeader";
import { SearchBox } from "@/components/SearchBox";
import { Empty } from "@/components/States";
import { api } from "@/lib/api";
import { readParam, type SearchParams } from "@/lib/leagues";
import { upper } from "@/lib/format";
import type { SearchHit, SearchResults } from "@/lib/types";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Αναζήτηση",
  description: "Βρες σωματείο, παίκτη ή γήπεδο σε ένα πεδίο.",
};

type Category = "ola" | "somateia" | "gipeda" | "paiktes" | "agones";

const TABS: { key: Category; label: string }[] = [
  { key: "ola", label: "Όλα" },
  { key: "somateia", label: "Ομάδες" },
  { key: "paiktes", label: "Παίκτες" },
  { key: "gipeda", label: "Γήπεδα" },
  { key: "agones", label: "Αγώνες" },
];

/** Per kind: where a hit goes, what its badge says, and how its avatar reads.
 *
 *  The design gives clubs and players a green circle carrying initials, and
 *  grounds a square-ish tinted tile with a crosshair — a ground has no
 *  initials, and a circle full of "ΔΗ" would look like a club that is not one.
 */
const KIND = {
  team: { href: "/somateia", badge: "ΟΜΑΔΑ", section: "ΟΜΑΔΕΣ" },
  field: { href: "/gipeda", badge: "ΓΗΠΕΔΟ", section: "ΓΗΠΕΔΑ" },
  player: { href: "/paiktes", badge: "ΠΑΙΚΤΗΣ", section: "ΠΑΙΚΤΕΣ" },
  // Found by referee: they have no page, the matches they took do.
  match: { href: "/agones", badge: "ΑΓΩΝΑΣ", section: "ΑΓΩΝΕΣ (ΔΙΑΙΤΗΤΗΣ)" },
} as const;

/** The order the design lists them in for the "Όλα" tab: clubs, then grounds,
 *  then players. Not by count — by how often each is what somebody meant. A
 *  player search is the least specific query and the largest register, so on
 *  top it would bury the club whose name was typed under fifteen namesakes. */
const ALL_ORDER = ["team", "field", "player", "match"] as const;

function group(results: SearchResults, kind: (typeof ALL_ORDER)[number]) {
  if (kind === "team") return results.teams;
  if (kind === "field") return results.fields;
  if (kind === "match") return results.matches;
  return results.players;
}

/** Two letters, Greek-aware — a club opening with an accent must not be badged
 *  "ΉΠ", which a plain toUpperCase would produce. */
const initials = (name: string) => upper(name.slice(0, 2));

function Row({
  hit,
  last,
  showBadge,
}: {
  hit: SearchHit;
  last: boolean;
  showBadge: boolean;
}) {
  const kind = KIND[hit.kind];
  return (
    <Link
      href={`${kind.href}/${hit.slug}`}
      className={`${styles.row} ${last ? styles.rowLast : ""}`}
    >
      {hit.kind === "field" || hit.kind === "match" ? (
        <span className={styles.tile} aria-hidden="true">
          {hit.kind === "match" ? "⚽" : "⌖"}
        </span>
      ) : (
        <span className={styles.crest} aria-hidden="true">
          {initials(hit.name)}
        </span>
      )}
      <span className={styles.names}>
        <span className={styles.name}>{hit.name}</span>
        {hit.subtitle && <span className={styles.subtitle}>{hit.subtitle}</span>}
      </span>
      {/* Inside a single-category tab the group heading above already says
          what everything is, so a badge on every row is noise. */}
      {showBadge && <span className={styles.badge}>{kind.badge}</span>}
    </Link>
  );
}

function Section({
  label,
  hits,
  showBadges,
}: {
  label: string;
  hits: SearchHit[];
  showBadges: boolean;
}) {
  if (hits.length === 0) return null;
  return (
    <section className={styles.group}>
      <p className={styles.groupLabel}>{label}</p>
      <div className={styles.card}>
        {hits.map((hit, i) => (
          <Row
            key={`${hit.kind}:${hit.slug}`}
            hit={hit}
            last={i === hits.length - 1}
            showBadge={showBadges}
          />
        ))}
      </div>
    </section>
  );
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  // ?q= too: it is what every other site uses, and what people type by hand.
  const query =
    (readParam(params, "anazitisi") ?? readParam(params, "q"))?.trim() ?? "";
  const asked = readParam(params, "kat");
  const category: Category = TABS.some((t) => t.key === asked)
    ? (asked as Category)
    : "ola";

  const blank: SearchResults = { query, teams: [], players: [], fields: [], matches: [] };
  // Two characters, the same floor the API applies. Asking below it would
  // return nothing anyway, and this saves the round trip.
  const found = query.length >= 2 ? await api.search(query) : blank;
  // An API from before referee search has no `matches`; treat it as none
  // rather than failing the whole page during a staggered deploy.
  const results: SearchResults = { ...found, matches: found.matches ?? [] };

  const counts = {
    ola:
      results.teams.length +
      results.fields.length +
      results.players.length +
      results.matches.length,
    somateia: results.teams.length,
    paiktes: results.players.length,
    gipeda: results.fields.length,
    agones: results.matches.length,
  };

  const tabHref = (key: Category) => {
    const next = new URLSearchParams();
    if (query) next.set("anazitisi", query);
    if (key !== "ola") next.set("kat", key);
    const qs = next.toString();
    return qs ? `/anazitisi?${qs}` : "/anazitisi";
  };

  const shown: (typeof ALL_ORDER)[number][] =
    category === "ola"
      ? [...ALL_ORDER]
      : category === "somateia"
        ? ["team"]
        : category === "gipeda"
          ? ["field"]
          : category === "agones"
            ? ["match"]
            : ["player"];

  return (
    <>
      <PageHeader title="Αναζήτηση" />

      <div className={styles.page}>
        <SearchBox
          placeholder="Σωματείο, παίκτης, γήπεδο ή διαιτητής…"
          label="Αναζήτηση σε σωματεία, παίκτες, γήπεδα και διαιτητές"
        />

        {query.length < 2 ? (
          <Empty
            title="Τι ψάχνεις;"
            body="Γράψε δύο γράμματα και πάνω. Ο τόνος δεν παίζει ρόλο — «ολυμπιακος» βρίσκει τον «ΟΛΥΜΠΙΑΚΟ»."
          />
        ) : (
          <>
            <nav className={styles.tabs} aria-label="Είδος αποτελέσματος">
              {TABS.map((tab) => (
                <Link
                  key={tab.key}
                  href={tabHref(tab.key)}
                  className={`${styles.tab} ${
                    tab.key === category ? styles.tabActive : ""
                  }`}
                  aria-current={tab.key === category ? "page" : undefined}
                  scroll={false}
                >
                  {tab.label}
                  <span className={styles.count}>{counts[tab.key]}</span>
                </Link>
              ))}
            </nav>

            {shown.every((kind) => group(results, kind).length === 0) ? (
              <Empty
                title="Κανένα αποτέλεσμα"
                body={`Δεν βρέθηκε τίποτα για «${query}»${
                  category === "ola" ? "" : " σε αυτή την κατηγορία"
                }. Το Πάμε Σέντρα καλύπτει προς το παρόν μόνο την ΕΠΣ Ηπείρου.`}
              />
            ) : (
              <>
                {shown.map((kind) => (
                  <Section
                    key={kind}
                    label={KIND[kind].section}
                    hits={group(results, kind)}
                    showBadges={shown.length > 1}
                  />
                ))}
                <p className={styles.note}>
                  Δείχνουμε τα οκτώ πρώτα κάθε κατηγορίας. Αν αυτό που ψάχνεις
                  δεν είναι εδώ, γράψε περισσότερα γράμματα.
                </p>
              </>
            )}
          </>
        )}
      </div>
    </>
  );
}
