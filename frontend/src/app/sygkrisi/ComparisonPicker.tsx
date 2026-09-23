"use client";

import { useRouter } from "next/navigation";

import type { Team } from "@/lib/types";
import styles from "./page.module.css";

/** Two selects and nothing else.
 *
 *  The choice lives in the URL rather than in component state, so a comparison
 *  can be sent to somebody — which is most of the point of having one.
 */
export function ComparisonPicker({
  teams,
  left,
  right,
}: {
  teams: Team[];
  left?: string;
  right?: string;
}) {
  const router = useRouter();

  const go = (a?: string, b?: string) => {
    const params = new URLSearchParams();
    if (a) params.set("a", a);
    if (b) params.set("b", b);
    const query = params.toString();
    router.replace(query ? `/sygkrisi?${query}` : "/sygkrisi", {
      scroll: false,
    });
  };

  return (
    <div className={styles.picker}>
      <Select
        label="Πρώτο σωματείο"
        teams={teams}
        value={left}
        onChange={(value) => go(value, right)}
      />
      <span className={styles.vs} aria-hidden="true">
        vs
      </span>
      <Select
        label="Δεύτερο σωματείο"
        teams={teams}
        value={right}
        onChange={(value) => go(left, value)}
      />
    </div>
  );
}

function Select({
  label,
  teams,
  value,
  onChange,
}: {
  label: string;
  teams: Team[];
  value?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className={styles.field}>
      <span className={styles.fieldLabel}>{label}</span>
      <select
        className={styles.select}
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">— διάλεξε —</option>
        {teams.map((team) => (
          <option key={team.id} value={team.slug}>
            {team.name}
          </option>
        ))}
      </select>
    </label>
  );
}
