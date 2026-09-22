import type { Metadata } from "next";

import { EditorDashboard } from "./EditorDashboard";
import pageStyles from "../page.module.css";

// Nothing here is public, so nothing here is cached or indexed.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Διαχείριση",
  robots: { index: false, follow: false },
};

export default function EditorPage() {
  return (
    <div className={pageStyles.page}>
      <EditorDashboard />
    </div>
  );
}
