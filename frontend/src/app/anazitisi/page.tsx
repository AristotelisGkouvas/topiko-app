import type { Metadata } from "next";
import Link from "next/link";

import { Empty } from "@/components/States";
import { SearchBox } from "@/components/SearchBox";
import { api } from "@/lib/api";
import { readParam, type SearchParams } from "@/lib/leagues";
import type { SearchHit, SearchResults } from "@/lib/types";
import pageStyles from "../page.module.css";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Αναζήτηση",
  description: "Βρες σωματείο, παίκτη ή γήπεδο σε ένα πεδίο.",
};

type Category = "ola" | "somateia" | "paiktes" | "gipeda";

const TABS: { key: Category; label: string }[] = [
  { key: "ola", label: "Όλα" },
  { key: "somateia", label: "Ομάδες" },
  { key: "paiktes", label: "Παίκτες" },
  { key: "gipeda", label: "Γήπεδα" },
];

/** Where a hit takes you, and the glyph that says what it is.
 *
 *  The glyphs are the ones the nav already uses for the same things, so a
 *  reader who has seen the tab bar recognises them without a legend.
 */
const KIND = {
  team: { href: "/somateia", glyph: "⬢", noun: "Σωματείο" },
  player: { href: "/paiktes", glyph: "☗", noun: "Παίκτης" },
  field: { href: "/gipeda", glyph: "⌖", noun: "Γήπεδο" },
} as const;

function counts(results: SearchResults) {
  return {
    ola: results.teams.length + results.players.length + results.fields.length,
    somateia: results.teams.length,
    paiktes: results.players.length,
    gipeda: results.fields.length,
  };
}

/** What the chosen tab shows.
 *
 *  "Όλα" is clubs first, then grounds, then players — not because there are
 *  fewer of each, but because that is how often they are what somebody meant.
 *  Players are the largest register and the least specific query; putting them
 *  on top would bury the club you typed the name of under fifteen namesakes.
 */
function visible(results: SearchResults, category: Category): SearchHit[] {
  switch (category) {
    case "somateia":
      return results.teams;
    case "paiktes":
      return results.players;
    case "gipeda":
      return results.fields;
    default:
      return [...results.teams, ...results.fields, ...results.players];
  }
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const query = readParam(params, "anazitisi")?.trim() ?? "";
  const asked = readParam(params, "kat");
  const category: Category =
    TABS.some((t) => t.key === asked) ? (asked as Category) : "ola";

  const empty: SearchResults = { query, teams: [], players: [], fields: [] };
  // Two characters, the same floor the API applies. Asking below it would
  // return nothing anyway, and this saves the round trip.
  const results = query.length >= 2 ? await api.search(query) : empty;
  const total = counts(results);
  const rows = visible(results, category);

  const tabHref = (key: Category) => {
    const next = new URLSearchParams();
    if (query) next.set("anazitisi", query);
    if (key !== "ola") next.set("kat", key);
    const qs = next.toString();
    return qs ? `/anazitisi?${qs}` : "/anazitisi";
  };

  return (
    <div className={pageStyles.page}>
      <div className={pageStyles.titleBlock}>
        <h1>Αναζήτηση</h1>
      </div>

      <SearchBox
        placeholder="Σωματείο, παίκτης ή γήπεδο…"
        label="Αναζήτηση σε σωματεία, παίκτες και γήπεδα"
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
                className={styles.tab}
                aria-current={tab.key === category ? "page" : undefined}
                scroll={false}
              >
                {tab.label}
                <span className={styles.count}>{total[tab.key]}</span>
              </Link>
            ))}
          </nav>

          {rows.length === 0 ? (
            <Empty
              title="Κανένα αποτέλεσμα"
              body={`Δεν βρέθηκε τίποτα για «${query}»${
                category === "ola" ? "" : " σε αυτή την κατηγορία"
              }.`}
            />
          ) : (
            <ul className={styles.list}>
              {rows.map((hit) => {
                const kind = KIND[hit.kind];
                return (
                  <li key={`${hit.kind}:${hit.slug}`}>
                    <Link href={`${kind.href}/${hit.slug}`} className={styles.row}>
                      <span className={styles.glyph} aria-hidden="true">
                        {kind.glyph}
                      </span>
                      <span className={styles.names}>
                        <span className={styles.name}>{hit.name}</span>
                        {hit.subtitle && (
                          <span className={styles.subtitle}>{hit.subtitle}</span>
                        )}
                      </span>
                      {/* Only in the mixed list: inside a tab the heading
                          already says what everything is. */}
                      {category === "ola" && (
                        <span className={styles.noun}>{kind.noun}</span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}

          {rows.length > 0 && (
            <p className={styles.note}>
              Δείχνουμε τα οκτώ πρώτα κάθε κατηγορίας. Αν αυτό που ψάχνεις δεν
              είναι εδώ, γράψε περισσότερα γράμματα.
            </p>
          )}
        </>
      )}
    </div>
  );
}
