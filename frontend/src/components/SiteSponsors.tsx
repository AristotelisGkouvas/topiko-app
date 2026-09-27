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
      </div>
    </SiteSponsorsGate>
  );
}
