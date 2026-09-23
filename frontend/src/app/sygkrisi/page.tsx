import type { Metadata } from "next";

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

  const teams = await api.listTeams();
  const comparison =
    left && right && left !== right
      ? await api.compareTeams(left, right).catch(() => null)
      : null;

  return (
    <div className={pageStyles.page}>
      <div className={pageStyles.titleBlock}>
        <h1>Σύγκριση</h1>
      </div>

      <ComparisonPicker teams={teams} left={left} right={right} />

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
