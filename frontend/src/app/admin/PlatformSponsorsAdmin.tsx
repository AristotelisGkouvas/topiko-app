"use client";

import { useState } from "react";
import useSWR from "swr";

import { confirm } from "@/components/ConfirmDialog";
import { Empty } from "@/components/States";
import { ApiError } from "@/lib/api";
import { editorApi, type PlatformSponsorEdit } from "@/lib/editorApi";
import { mediaUrl } from "@/lib/media";
import { shrink } from "@/lib/shrink";
import { SPONSOR_STATUS, dayLabel, daysUntil } from "@/lib/sponsorStatus";
import type { PlatformSponsorAdmin, SponsorPlacement } from "@/lib/types";
import { noteAuthError } from "./session";
import { RESTRICTED, SponsorCategorySelect } from "./SponsorCategory";
import styles from "./PlatformSponsorsAdmin.module.css";
import page from "./page.module.css";

const PLACEMENTS: { key: SponsorPlacement; label: string; hint: string }[] = [
  { key: "site", label: "Όλες οι σελίδες", hint: "λωρίδα στο τέλος κάθε σελίδας" },
  { key: "home", label: "Αρχική", hint: "μεγάλο πλαίσιο στην αρχική, ένας χορηγός κάθε μέρα" },
  { key: "match", label: "Αγώνες", hint: "«Με την υποστήριξη» πάνω από το σκορ" },
  { key: "share", label: "Εικόνες για κοινοποίηση", hint: "όταν κάποιος στέλνει αγώνα ή βαθμολογία σε Viber, Facebook, Instagram" },
];

const numberFmt = new Intl.NumberFormat("el-GR");

/** ISO date `months` after the later of today and `from`, keeping to the
 *  target month's last day when it is shorter: 31/10 + 1 is 30/11, not 01/12
 *  as Date's overflow made it. */
export function extend(from: string | null | undefined, months: number, today?: string): string {
  const now = today ?? new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Athens" }).format(new Date());
  const base = from && from > now ? from : now;
  const [y, m, d] = base.split("-").map(Number);
  const lastDay = new Date(Date.UTC(y, m - 1 + months + 1, 0)).getUTCDate();
  const next = new Date(Date.UTC(y, m - 1 + months, Math.min(d, lastDay)));
  return next.toISOString().slice(0, 10);
}

/** "fournos.gr" is how people type a site; the API wants a scheme. */
function withScheme(raw: string): string | null {
  const text = raw.trim();
  if (!text) return null;
  return /^https?:\/\//i.test(text) ? text : `https://${text}`;
}

/** Runs one save. Resolves to the error message, or null when it worked —
 *  so a form clears itself only after a success, and shows its own error
 *  next to it instead of at the top of a page thousands of pixels away. */
type Run = (label: string, action: () => Promise<PlatformSponsorAdmin[]>) => Promise<string | null>;

/** The platform's sponsors: who is shown where, until when, and how often
 *  they were seen. Admin only. */
export function PlatformSponsorsAdmin() {
  const { data, error, isLoading, mutate } = useSWR<PlatformSponsorAdmin[]>(
    "editor:platform-sponsors",
    () => editorApi.platformSponsors(),
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const run: Run = async (label, action) => {
    setBusy(label);
    setActionError(null);
    try {
      await mutate(await action(), { revalidate: false });
      return null;
    } catch (err) {
      noteAuthError(err);
      return err instanceof ApiError ? err.message : "Απέτυχε. Δοκίμασε ξανά.";
    } finally {
      setBusy(null);
    }
  };
  // Reordering has no card of its own to report on, so its error goes on top.
  const reorder = async (ids: number[]) => setActionError(await run("order", () => editorApi.orderPlatformSponsors(ids)));

  if (isLoading) return <p className={page.loading}>Φόρτωση χορηγών…</p>;
  if (error) {
    return <Empty title="Δεν φορτώθηκαν οι χορηγοί" body="Ανανέωσε τη σελίδα σε λίγο." />;
  }
  const all = data ?? [];
  const current = all.filter((s) => s.status !== "ended");
  const ended = all.filter((s) => s.status === "ended");

  return (
    <div className={styles.wrap}>
      <p className={styles.intro}>
        Οι μεγάλοι χορηγοί της πλατφόρμας. Εμφανίζονται μόνοι τους από την ημερομηνία έναρξης και
        φεύγουν μόνοι τους μετά τη λήξη, στις θέσεις που επιλέγεις.
      </p>

      <ExpiryNotice sponsors={all} />
      <ShareNotice sponsors={current} />

      {/* At the top: adding a sponsor is the thing most visits come to do. */}
      {!adding && (
        <button type="button" className={page.save} onClick={() => setAdding(true)}>
          + Νέος χορηγός πλατφόρμας
        </button>
      )}
      {adding && <AddSponsor busy={busy} run={run} onClose={() => setAdding(false)} />}

      {actionError && (
        <p className={page.rowError} role="alert">
          {actionError}
        </p>
      )}

      {current.length > 0 ? (
        <ul className={styles.list}>
          {current.map((sponsor, i) => (
            <SponsorCard
              key={sponsor.id}
              sponsor={sponsor}
              busy={busy}
              run={run}
              first={i === 0}
              last={i === current.length - 1}
              onMove={(by) => {
                const ids = all.map((s) => s.id);
                const from = ids.indexOf(sponsor.id);
                const to = ids.indexOf(current[i + by].id);
                [ids[from], ids[to]] = [ids[to], ids[from]];
                void reorder(ids);
              }}
            />
          ))}
        </ul>
      ) : (
        <p className={styles.muted}>Δεν υπάρχει ενεργός ή προγραμματισμένος χορηγός.</p>
      )}


      {ended.length > 0 && (
        <details className={styles.history}>
          <summary>Έληξαν ({ended.length})</summary>
          <p className={styles.muted}>
            Μένουν εδώ με τις προβολές και τα κλικ τους. Η «Ανανέωση» τους ξαναβάζει στον αέρα με νέα λήξη.
          </p>
          <ul className={styles.list}>
            {ended.map((sponsor) => (
              <SponsorCard key={sponsor.id} sponsor={sponsor} busy={busy} run={run} />
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

/** Deals ending within two weeks, and those that ended in the last two: the
 *  renewal call to make this week. */
export function ExpiryNotice({ sponsors }: { sponsors: PlatformSponsorAdmin[] }) {
  const due = sponsors.filter(
    (s) => s.is_active && s.ends_on && daysUntil(s.ends_on) <= 14 && daysUntil(s.ends_on) >= -14,
  );
  if (due.length === 0) return null;
  return (
    <div className={styles.notice} role="status">
      <strong>Για ανανέωση:</strong>
      <ul>
        {due.map((s) => {
          const days = daysUntil(s.ends_on!);
          return (
            <li key={s.id}>
              {s.name} —{" "}
              {days < 0
                ? `έληξε στις ${dayLabel(s.ends_on)}`
                : days === 0
                  ? "λήγει σήμερα"
                  : `λήγει σε ${days} ${days === 1 ? "ημέρα" : "ημέρες"} (${dayLabel(s.ends_on)})`}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** The share images carry at most four logos, and only PNG ones: say so
 *  before a fifth sponsor is sold a place it will never get. */
function ShareNotice({ sponsors }: { sponsors: PlatformSponsorAdmin[] }) {
  const sharing = sponsors.filter(
    (s) => s.placements.includes("share") && (s.status === "live" || s.status === "ending"),
  );
  const noLogo = sharing.filter((s) => !s.logo_png_url);
  const shown = sharing.filter((s) => s.logo_png_url);
  if (shown.length <= 4 && noLogo.length === 0) return null;
  return (
    <div className={styles.notice} role="status">
      <strong>Εικόνες κοινοποίησης:</strong>
      <ul>
        {shown.length > 4 && (
          <li>
            Χωράνε 4 λογότυπα· τώρα είναι {shown.length}. Εμφανίζονται οι 4 πρώτοι της λίστας (
            {shown.slice(0, 4).map((s) => s.name).join(", ")}).
          </li>
        )}
        {noLogo.length > 0 && (
          <li>Χωρίς λογότυπο, άρα δεν εμφανίζονται: {noLogo.map((s) => s.name).join(", ")}.</li>
        )}
      </ul>
    </div>
  );
}

function StatusChip({ status }: { status: string }) {
  const s = SPONSOR_STATUS[status] ?? SPONSOR_STATUS.live;
  return <span className={`${styles.chip} ${styles[`chip_${s.tone}`]}`}>{s.label}</span>;
}

function Stats({ sponsor }: { sponsor: PlatformSponsorAdmin }) {
  const rate =
    sponsor.views_30d > 0 ? ((sponsor.clicks_30d / sponsor.views_30d) * 100).toFixed(1) : null;
  return (
    <p className={styles.stats}>
      <span>
        30 ημέρες: <strong>{numberFmt.format(sponsor.views_30d)}</strong> προβολές ·{" "}
        <strong>{numberFmt.format(sponsor.clicks_30d)}</strong> κλικ
        {rate ? ` (${rate.replace(".", ",")}%)` : ""}
      </span>
      <span className={styles.muted}>
        Συνολικά: {numberFmt.format(sponsor.views_total)} προβολές ·{" "}
        {numberFmt.format(sponsor.clicks_total)} κλικ
      </span>
    </p>
  );
}

function SponsorCard({
  sponsor,
  busy,
  run,
  first = true,
  last = true,
  onMove,
}: {
  sponsor: PlatformSponsorAdmin;
  busy: string | null;
  run: Run;
  first?: boolean;
  last?: boolean;
  onMove?: (by: number) => void;
}) {
  const [name, setName] = useState(sponsor.name);
  const [url, setUrl] = useState(sponsor.website_url ?? "");
  const [startsOn, setStartsOn] = useState(sponsor.starts_on ?? "");
  const [endsOn, setEndsOn] = useState(sponsor.ends_on ?? "");
  const [placements, setPlacements] = useState<string[]>(sponsor.placements);
  const [note, setNote] = useState(sponsor.note ?? "");
  const [category, setCategory] = useState<string>(sponsor.category ?? "general");
  // Restricted categories cannot take the placements that sit around youth
  // football; the API refuses it too, this says so before saving.
  const blocked = RESTRICTED.has(category) && placements.some((p) => p === "site" || p === "home");
  const disabled = busy !== null;
  const logo = mediaUrl(sponsor.logo_url);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  // Closed by default: a list of whole forms ran to 8,000px and buried the
  // one thing most visits come for — who is on, until when, how it is doing.
  const [open, setOpen] = useState(false);
  /** Every action on this card reports here, next to it. */
  const act = async (label: string, action: () => Promise<PlatformSponsorAdmin[]>) => {
    setSaved(false);
    const failed = await run(label, action);
    setError(failed);
    if (!failed) setSaved(true);
    return failed;
  };

  const changed =
    name.trim() !== sponsor.name ||
    withScheme(url) !== (sponsor.website_url ?? null) ||
    (startsOn || null) !== (sponsor.starts_on ?? null) ||
    (endsOn || null) !== (sponsor.ends_on ?? null) ||
    [...placements].sort().join() !== [...sponsor.placements].sort().join() ||
    (note.trim() || null) !== (sponsor.note ?? null) ||
    category !== (sponsor.category ?? "general");

  const save = () =>
    act(`save-${sponsor.id}`, () =>
      editorApi.savePlatformSponsor(sponsor.id, {
        name: name.trim(),
        website_url: withScheme(url),
        starts_on: startsOn || null,
        ends_on: endsOn || null,
        placements: placements as SponsorPlacement[],
        note: note.trim() || null,
        category: category as PlatformSponsorEdit["category"],
      }),
    );

  const renew = (months: number) => {
    const next = extend(sponsor.ends_on, months);
    setEndsOn(next);
    return act(`renew-${sponsor.id}`, () =>
      editorApi.savePlatformSponsor(sponsor.id, { ends_on: next, is_active: true }),
    );
  };

  return (
    <li className={`${styles.card} ${sponsor.status === "ended" || !sponsor.is_active ? styles.dim : ""}`}>
      <div className={styles.head}>
        <label className={styles.logo} title="Αλλαγή λογότυπου">
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element -- a small WebP from the API
            <img src={logo} alt="" />
          ) : (
            <span>+ λογότυπο</span>
          )}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className={styles.hiddenInput}
            disabled={disabled}
            aria-label={`Λογότυπο για ${sponsor.name}`}
            onChange={async (e) => {
              const picked = e.target.files?.[0];
              e.target.value = "";
              if (picked) {
                await act(`logo-${sponsor.id}`, async () =>
                  editorApi.setPlatformSponsorLogo(sponsor.id, await shrink(picked, "logo")),
                );
              }
            }}
          />
        </label>
        <div className={styles.headText}>
          <strong className={styles.name}>{sponsor.name}</strong>
          <StatusChip status={sponsor.status} />
          <span className={styles.muted}>
            {sponsor.starts_on ? `από ${dayLabel(sponsor.starts_on)} ` : ""}
            {sponsor.ends_on ? `έως ${dayLabel(sponsor.ends_on)}` : "χωρίς λήξη"}
          </span>
        </div>
      </div>

      <Stats sponsor={sponsor} />

      {open && (
        <div className={styles.fields}>
          <label className={styles.field}>
            Όνομα
            <input className={page.input} value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className={styles.field}>
            Ιστοσελίδα
            <input
              className={page.input}
              value={url}
              inputMode="url"
              placeholder="π.χ. ergo.gr"
              onChange={(e) => setUrl(e.target.value)}
            />
          </label>
          <div className={styles.dates}>
            <label className={styles.field}>
              Έναρξη
              <input className={page.input} type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} />
            </label>
            <label className={styles.field}>
              Λήξη
              <input className={page.input} type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} />
            </label>
          </div>
          <PlacementPicker value={placements} onChange={setPlacements} />
          <SponsorCategorySelect className={styles.field} value={category} onChange={setCategory} />
          <label className={styles.field}>
            Σημειώσεις γραφείου (δεν εμφανίζονται)
            <textarea
              className={`${page.input} ${styles.note}`}
              value={note}
              maxLength={500}
              placeholder="Επαφή, ποσό, αρ. τιμολογίου…"
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
        </div>
      )}

      {error && (
        <p className={page.rowError} role="alert">
          {error}
        </p>
      )}
      {saved && !changed && !error && (
        <p className={styles.saved} role="status">
          ✓ Αποθηκεύτηκε. Στο site φαίνεται σε έως 1 λεπτό.
        </p>
      )}

      <div className={styles.actions}>
        {changed && placements.length === 0 && (
          <span className={page.rowError}>Διάλεξε τουλάχιστον μία θέση.</span>
        )}
        {changed && blocked && (
          <span className={page.rowError}>Βγάλε το «Όλο το site» και την «Αρχική» για αυτή την κατηγορία.</span>
        )}
        {changed && (
          <button
            type="button"
            className={page.save}
            disabled={disabled || !name.trim() || placements.length === 0 || blocked}
            onClick={save}
          >
            {busy === `save-${sponsor.id}` ? "Αποθήκευση…" : "Αποθήκευση"}
          </button>
        )}
        {(sponsor.status === "ending" || sponsor.status === "ended") && (
          <span className={styles.renew}>
            Ανανέωση:
            {[1, 3, 12].map((m) => (
              <button key={m} type="button" className={styles.small} disabled={disabled} onClick={() => renew(m)}>
                +{m === 12 ? "1 χρόνο" : `${m} ${m === 1 ? "μήνα" : "μήνες"}`}
              </button>
            ))}
          </span>
        )}
        <button
          type="button"
          className={styles.small}
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          {open ? "Κλείσιμο" : "Επεξεργασία"}
        </button>
        {open && onMove && (
          <>
            <button
              type="button"
              className={styles.small}
              disabled={disabled || first}
              onClick={() => onMove(-1)}
              aria-label={`Μετακίνηση πιο πάνω: ${sponsor.name}`}
            >
              ↑
            </button>
            <button
              type="button"
              className={styles.small}
              disabled={disabled || last}
              onClick={() => onMove(1)}
              aria-label={`Μετακίνηση πιο κάτω: ${sponsor.name}`}
            >
              ↓
            </button>
          </>
        )}
        {open && (
        <label className={styles.toggle}>
          {/* "Σε παύση", not "Ενεργός": the status chip above already says
              "Ενεργός", and the same word as a switch read as the status. */}
          <input
            type="checkbox"
            checked={!sponsor.is_active}
            disabled={disabled}
            onChange={(e) =>
              act(`pause-${sponsor.id}`, () =>
                editorApi.savePlatformSponsor(sponsor.id, { is_active: !e.target.checked }),
              )
            }
          />
          Σε παύση
        </label>
        )}
        {open && (
        <button
          type="button"
          className={styles.danger}
          aria-label={`Διαγραφή: ${sponsor.name}`}
          disabled={disabled}
          onClick={async () => {
            if (
              await confirm(`Οριστική διαγραφή του «${sponsor.name}»;`, {
                detail: "Για τέλος συνεργασίας αρκεί η λήξη ή η παύση — κρατούν το ιστορικό.",
                confirmLabel: "Διαγραφή",
                danger: true,
              })
            ) {
              act(`remove-${sponsor.id}`, () => editorApi.removePlatformSponsor(sponsor.id));
            }
          }}
        >
          Διαγραφή
        </button>
        )}
      </div>
    </li>
  );
}

function PlacementPicker({ value, onChange }: { value: string[]; onChange: (next: string[]) => void }) {
  return (
    <fieldset className={styles.placements}>
      <legend>Πού εμφανίζεται</legend>
      {PLACEMENTS.map((p) => (
        <label key={p.key} className={styles.placement}>
          <input
            type="checkbox"
            checked={value.includes(p.key)}
            onChange={(e) =>
              onChange(e.target.checked ? [...value, p.key] : value.filter((v) => v !== p.key))
            }
          />
          <span>
            {p.label} <span className={styles.muted}>— {p.hint}</span>
          </span>
        </label>
      ))}
    </fieldset>
  );
}

function AddSponsor({ busy, run, onClose }: { busy: string | null; run: Run; onClose: () => void }) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const [placements, setPlacements] = useState<string[]>(PLACEMENTS.map((p) => p.key));
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileKey, setFileKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<string | null>(null);

  async function add() {
    setAdded(null);
    if (startsOn && endsOn && endsOn < startsOn) {
      // Caught here, before anything is sent, with everything typed kept.
      setError("Η λήξη είναι πριν από την έναρξη.");
      return;
    }
    const failed = await run("add", async () =>
      editorApi.addPlatformSponsor({
        name: name.trim(),
        website_url: withScheme(url) ?? undefined,
        starts_on: startsOn || undefined,
        ends_on: endsOn || undefined,
        placements: placements.join(","),
        note: note.trim() || undefined,
        file: file ? await shrink(file, "logo") : null,
      }),
    );
    setError(failed);
    // A failed save keeps the form as typed: the fix is one field, not all.
    if (failed) return;
    setAdded(name.trim());
    setName("");
    setUrl("");
    setStartsOn("");
    setEndsOn("");
    setNote("");
    setFile(null);
    setFileKey((k) => k + 1);
  }

  return (
    <form
      className={styles.add}
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim() && placements.length > 0) add();
      }}
    >
      <div className={styles.addHead}>
        <strong>Νέος χορηγός πλατφόρμας</strong>
        <button type="button" className={styles.small} onClick={onClose}>
          Άκυρο
        </button>
      </div>
      <label className={styles.field}>
        Όνομα
        <input className={page.input} value={name} maxLength={120} required onChange={(e) => setName(e.target.value)} />
      </label>
      <label className={styles.field}>
        Ιστοσελίδα (προαιρετική)
        <input className={page.input} value={url} inputMode="url" onChange={(e) => setUrl(e.target.value)} />
      </label>
      <div className={styles.dates}>
        <label className={styles.field}>
          Έναρξη (αν μείνει κενό: από σήμερα)
          <input className={page.input} type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} />
        </label>
        <label className={styles.field}>
          Λήξη (αν μείνει κενό: δεν λήγει)
          <input className={page.input} type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} />
        </label>
      </div>
      <PlacementPicker value={placements} onChange={setPlacements} />
      <label className={styles.field}>
        Σημειώσεις γραφείου (προαιρετικές)
        <textarea className={`${page.input} ${styles.note}`} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
      </label>
      <label className={styles.field}>
        Λογότυπο (PNG με διάφανο φόντο δείχνει καλύτερα)
        <input
          key={fileKey}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
      </label>
      {placements.length === 0 && <p className={page.rowError}>Διάλεξε τουλάχιστον μία θέση.</p>}
      {error && (
        <p className={page.rowError} role="alert">
          {error}
        </p>
      )}
      {added && (
        <p className={styles.saved} role="status">
          ✓ Προστέθηκε ο «{added}». Στο site φαίνεται σε έως 1 λεπτό.
        </p>
      )}
      <button type="submit" className={page.save} disabled={busy !== null || !name.trim() || placements.length === 0}>
        {busy === "add" ? "Προσθήκη…" : "Προσθήκη χορηγού"}
      </button>
    </form>
  );
}
