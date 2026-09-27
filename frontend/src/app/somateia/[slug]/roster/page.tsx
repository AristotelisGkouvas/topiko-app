import type { Metadata } from "next";

import { PageHeader } from "@/components/PageHeader";
import { RosterList } from "./RosterList";
import { api } from "@/lib/api";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const team = await api.getTeam(slug).catch(() => null);
  return team
    ? {
        title: `Ρόστερ · ${team.name}`,
        description: `${team.name}: οι παίκτες της φετινής περιόδου, με γκολ, κάρτες και τιμωρίες.`,
      }
    : { title: "Ρόστερ" };
}

/** Everyone who has played for the club this season — and who may be out. */
export default async function RosterPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return (
    <>
      <PageHeader title="Ρόστερ" />
      <RosterList slug={slug} />
    </>
  );
}
