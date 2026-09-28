import Link from "next/link";

import { SiteSponsorsGate } from "@/components/SiteSponsorsGate";
import { SponsorStrip } from "@/components/SponsorStrip";
import { api } from "@/lib/api";

/** The platform's sponsors, at the foot of every page. */
export async function SiteSponsors() {
  const sponsors = await api.listPlatformSponsors("site").catch(() => []);
  if (sponsors.length === 0) return null;
  return (
    <SiteSponsorsGate>
      <div style={{ marginTop: 28 }}>
        <SponsorStrip sponsors={sponsors} kind="platform" label="Μεγάλοι χορηγοί" />
        <p style={{ margin: "8px 0 0", textAlign: "center", fontSize: "var(--text-sm)" }}>
          <Link href="/xorigies">Γίνε χορηγός ›</Link>
        </p>
      </div>
    </SiteSponsorsGate>
  );
}
