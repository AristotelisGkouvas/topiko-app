import type { Metadata } from "next";

import { PageHeader } from "@/components/PageHeader";
import { Ballot } from "./Ballot";

export const metadata: Metadata = {
  title: "Παίκτης της αγωνιστικής",
  description: "Ψήφισε τον καλύτερο της αγωνιστικής.",
};

/** Screens M1–M3. Entirely client-side: whether the ballot or the result is
 *  shown depends on whether this browser has already voted, which the server
 *  cannot know until asked. */
export default function MvpPage() {
  return (
    <>
      <PageHeader title="Παίκτης της αγωνιστικής" />
      <Ballot />
    </>
  );
}
