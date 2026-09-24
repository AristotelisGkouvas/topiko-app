import type { Metadata } from "next";

import { PageHeader } from "@/components/PageHeader";
import { NotifySettings } from "./NotifySettings";

export const metadata: Metadata = {
  title: "Ειδοποιήσεις",
  description: "Τι σου στέλνουμε, για ποια ομάδα και πότε.",
};

/** Screen N1. Entirely client-side: what it shows depends on what this
 *  browser is subscribed to, which the server cannot know until asked. */
export default function NotificationsPage() {
  return (
    <>
      <PageHeader title="Ειδοποιήσεις" />
      <NotifySettings />
    </>
  );
}
