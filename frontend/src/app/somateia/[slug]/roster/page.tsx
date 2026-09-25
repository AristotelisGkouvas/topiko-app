import type { Metadata } from "next";

import { PageHeader } from "@/components/PageHeader";
import { RosterList } from "./RosterList";

export const metadata: Metadata = { title: "Ρόστερ" };

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
