import type { Metadata } from "next";
import { PageHeader } from "@/components/PageHeader";

import { LeagueChips } from "@/components/LeagueChips";
import { Empty } from "@/components/States";
import { api } from "@/lib/api";
import { readParam, type SearchParams } from "@/lib/leagues";
import { ComparisonPicker } from "./ComparisonPicker";
import { ComparisonTable } from "./ComparisonTable";
import pageStyles from "../page.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Σύγκριση",
  description: "Δύο σωματεία δίπλα-δίπλα: επιδόσεις, φόρμα και το ιστορικό τους.",
};

export default async function ComparePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const left = readParam(params, "a");
  const right = readParam(params, "b");

  // 177 clubs in one dropdown is a scroll nobody finishes; narrowing to one
  // division makes it a dozen.
  const liga = readParam(params, "liga");
  const [allTeams, leagues] = await Promise.all([api.listTeams(), api.listLeagues()]);
  const league = leagues.find((l) => l.slug === liga);
  const inLeague = league
    ? new Set((await api.getStandings(league.slug)).map((row) => row.team.slug))
    : null;
  const teams =
    inLeague && inLeague.size > 0
      ? allTeams.filter((t) => inLeague.has(t.slug) || t.slug === left || t.slug === right)
      : allTeams;
  const comparison =
    left && right && left !== right
      ? await api.compareTeams(left, right).catch(() => null)
      : null;

  return (
    <div className={pageStyles.page}>
      <PageHeader title="Σύγκριση" />

      <LeagueChips
        leagues={leagues}
        active={league?.slug ?? "oles"}
        basePath="/sygkrisi"
        withAll
      />

      <ComparisonPicker teams={teams} left={left} right={right} league={league?.slug} />

      {comparison ? (
        <ComparisonTable comparison={comparison} />
      ) : (
        <Empty
          title="Διάλεξε δύο σωματεία"
          body={
            left && left === right
              ? "Χρειάζονται δύο διαφορετικά σωματεία."
              : "Οι επιδόσεις τους εμφανίζονται δίπλα-δίπλα, μαζί με το ιστορικό των μεταξύ τους αγώνων."
          }
        />
      )}
    </div>
  );
}
