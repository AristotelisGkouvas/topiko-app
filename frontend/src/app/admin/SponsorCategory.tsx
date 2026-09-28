import page from "./page.module.css";

/** What a sponsor sells, as far as where it may appear goes. */
export type SponsorCategory = "general" | "betting" | "alcohol" | "tobacco";

export const RESTRICTED: ReadonlySet<string> = new Set(["betting", "alcohol", "tobacco"]);

const OPTIONS: { key: SponsorCategory; label: string }[] = [
  { key: "general", label: "Γενική" },
  { key: "betting", label: "Στοίχημα" },
  { key: "alcohol", label: "Αλκοόλ" },
  { key: "tobacco", label: "Καπνός" },
];

/** The category picker, with what it means said under it: betting, alcohol
 *  and tobacco never appear beside youth football. The API enforces it; this
 *  says so before anyone presses save. */
export function SponsorCategorySelect({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (next: SponsorCategory) => void;
  className?: string;
}) {
  return (
    <label className={className}>
      Κατηγορία
      <select
        className={page.input}
        value={value}
        onChange={(e) => onChange(e.target.value as SponsorCategory)}
      >
        {OPTIONS.map((o) => (
          <option key={o.key} value={o.key}>
            {o.label}
          </option>
        ))}
      </select>
      {RESTRICTED.has(value) && (
        <small>Δεν εμφανίζεται σε παιδικά πρωταθλήματα, ούτε σε «Όλο το site» ή «Αρχική».</small>
      )}
    </label>
  );
}
