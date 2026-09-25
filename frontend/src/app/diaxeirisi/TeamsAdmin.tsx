"use client";

import { useState } from "react";
import useSWR from "swr";

import { Crest } from "@/components/Crest";
import { Empty } from "@/components/States";
import { ApiError } from "@/lib/api";
import { editorApi } from "@/lib/editorApi";
import { mediaUrl } from "@/lib/media";
import { shrink } from "@/lib/shrink";
import type { SponsorAdmin, Team, TeamLook, TeamPhoto } from "@/lib/types";
import { noteAuthError } from "./session";
import styles from "./TeamsAdmin.module.css";
import page from "./page.module.css";

/** A club's look: logo, colours, gallery, sponsors. Admin only.
 *
 *  A list to pick a club from, then one screen for everything about it. Every
 *  call returns the club's whole look, so the screen is simply replaced with
 *  the answer — nothing to reconcile by hand after a save.
 */
export function TeamsAdmin() {
  const { data, error, isLoading } = useSWR<Team[]>("editor:teams", () => editorApi.teams());
  const [query, setQuery] = useState("");
  const [slug, setSlug] = useState<string | null>(null);

  if (slug) return <TeamLookEditor slug={slug} onBack={() => setSlug(null)} />;

  if (isLoading) return <p className={page.loading}>Φόρτωση σωματείων…</p>;
  if (error) return <Empty title="Δεν φορτώθηκαν τα σωματεία" />;

  const needle = query.trim().toLowerCase();
  const shown = (data ?? []).filter((t) => !needle || t.name.toLowerCase().includes(needle));
  const done = (data ?? []).filter((t) => t.logo_url).length;

  return (
    <>
      <div className={page.filters}>
        <input
          className={`${page.input} ${styles.field}`}
          placeholder="Αναζήτηση σωματείου…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Αναζήτηση σωματείου"
        />
        <span className={styles.muted}>
          {done} από {data?.length ?? 0} με σήμα
        </span>
      </div>
      <ul className={styles.teamList}>
        {shown.slice(0, 60).map((team) => (
          <li key={team.id}>
            <button type="button" className={styles.teamPick} onClick={() => setSlug(team.slug)}>
              <Crest team={team} size="md" />
              <span className={styles.teamName}>{team.name}</span>
              {team.primary_color && (
                <span className={styles.swatches} aria-hidden="true">
                  <span style={{ background: team.primary_color }} />
                  {team.secondary_color && <span style={{ background: team.secondary_color }} />}
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
      {shown.length > 60 && <p className={styles.muted}>Γράψε μέρος του ονόματος για να δεις περισσότερα.</p>}
    </>
  );
}

/** One call at a time, its error shown where it happened. */
function useAction(onDone: (look: TeamLook) => void) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function run(label: string, action: () => Promise<TeamLook>) {
    setBusy(label);
    setError(null);
    try {
      onDone(await action());
    } catch (err) {
      noteAuthError(err);
      setError(err instanceof ApiError ? err.message : "Απέτυχε. Δοκίμασε ξανά.");
    } finally {
      setBusy(null);
    }
  }
  return { busy, error, run };
}

function TeamLookEditor({ slug, onBack }: { slug: string; onBack: () => void }) {
  const { data, error, isLoading, mutate } = useSWR<TeamLook>(`editor:look:${slug}`, () =>
    editorApi.look(slug),
  );
  const replace = (look: TeamLook) => mutate(look, { revalidate: false });
  const { busy, error: actionError, run } = useAction(replace);

  if (isLoading) return <p className={page.loading}>Φόρτωση…</p>;
  if (error || !data) return <Empty title="Δεν φορτώθηκε το σωματείο" />;

  const { team } = data;

  return (
    <div className={styles.editor}>
      <div className={styles.editorHead}>
        <button type="button" className={styles.back} onClick={onBack}>
          ‹ Όλα τα σωματεία
        </button>
        <a className={styles.view} href={`/somateia/${team.slug}`} target="_blank" rel="noreferrer">
          Προβολή σελίδας ↗
        </a>
      </div>
      <h2 className={styles.teamTitle}>
        <Crest team={team} size="lg" />
        {team.name}
      </h2>

      {actionError && (
        <p className={page.rowError} role="alert">
          {actionError}
        </p>
      )}

      <section className={styles.block} aria-labelledby="look-logo">
        <h3 id="look-logo" className={styles.blockTitle}>Σήμα</h3>
        <p className={styles.muted}>
          PNG με διάφανο φόντο δείχνει καλύτερα. Εμφανίζεται σε κάθε λίστα, πίνακα και αγώνα.
        </p>
        <div className={styles.inline}>
          <FilePick
            label={team.logo_url ? "Αλλαγή σήματος" : "Ανέβασμα σήματος"}
            busy={busy === "logo"}
            onPick={(file) => run("logo", async () => editorApi.setLogo(slug, await shrink(file, "logo")))}
          />
          {team.logo_url && (
            <button
              type="button"
              className={styles.danger}
              disabled={busy !== null}
              onClick={() => {
                if (window.confirm("Αφαίρεση σήματος;")) run("logo", () => editorApi.removeLogo(slug));
              }}
            >
              Αφαίρεση
            </button>
          )}
        </div>
      </section>

      <Colours
        key={`${team.primary_color}-${team.secondary_color}`}
        team={team}
        busy={busy === "colours"}
        onSave={(edit) => run("colours", () => editorApi.saveColours(slug, edit))}
      />

      <Photos
        slug={slug}
        photos={data.photos}
        busy={busy}
        run={run}
      />

      <SponsorsEditor
        slug={slug}
        sponsors={data.sponsors}
        busy={busy}
        run={run}
      />
    </div>
  );
}

type Run = (label: string, action: () => Promise<TeamLook>) => Promise<void>;

function FilePick({
  label,
  busy,
  multiple = false,
  onPick,
}: {
  label: string;
  busy: boolean;
  multiple?: boolean;
  onPick: (file: File) => Promise<void> | void;
}) {
  return (
    <label className={`${page.save} ${styles.filePick} ${busy ? styles.disabled : ""}`}>
      {busy ? "Ανέβασμα…" : label}
      <input
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        multiple={multiple}
        disabled={busy}
        className={styles.hiddenInput}
        onChange={async (e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          // One after another: each answer is the whole look, and the last
          // one wins, so running them side by side would drop photos.
          for (const file of files) await onPick(file);
        }}
      />
    </label>
  );
}

function Colours({
  team,
  busy,
  onSave,
}: {
  team: Team;
  busy: boolean;
  onSave: (edit: { primary_color: string | null; secondary_color: string | null }) => void;
}) {
  const [primary, setPrimary] = useState(team.primary_color ?? "");
  const [secondary, setSecondary] = useState(team.secondary_color ?? "");
  const valid = (hex: string) => hex === "" || /^#[0-9a-f]{6}$/i.test(hex);
  const changed = primary !== (team.primary_color ?? "") || secondary !== (team.secondary_color ?? "");

  return (
    <section className={styles.block} aria-labelledby="look-colours">
      <h3 id="look-colours" className={styles.blockTitle}>Χρώματα</h3>
      <p className={styles.muted}>
        Το πρώτο γεμίζει τον κύκλο με τα αρχικά όταν δεν υπάρχει σήμα. Τα δύο μαζί μπαίνουν ως λωρίδα
        στην κορυφή της σελίδας του σωματείου.
      </p>
      <div className={styles.colours}>
        {[
          { label: "Κύριο", value: primary, set: setPrimary },
          { label: "Δεύτερο", value: secondary, set: setSecondary },
        ].map(({ label, value, set }) => (
          <div key={label} className={styles.colour}>
            <span className={styles.colourLabel}>{label}</span>
            <input
              type="color"
              value={valid(value) && value ? value : "#ffffff"}
              onChange={(e) => set(e.target.value)}
              aria-label={`${label} χρώμα`}
              className={styles.colourPick}
            />
            <input
              className={`${page.input} ${styles.hex}`}
              value={value}
              placeholder="#1a7f3c"
              onChange={(e) => set(e.target.value.trim())}
              aria-label={`${label} χρώμα σε hex`}
              aria-invalid={!valid(value)}
            />
            {value && (
              <button type="button" className={styles.linkish} onClick={() => set("")}>
                καθαρισμός
              </button>
            )}
          </div>
        ))}
        <div className={styles.colourPreview} aria-hidden="true">
          <Crest team={{ name: team.name, initials: team.initials, primary_color: valid(primary) && primary ? primary : null }} size="lg" />
          <span
            className={styles.band}
            style={{
              background: primary && valid(primary)
                ? `linear-gradient(90deg, ${primary} 0 50%, ${valid(secondary) && secondary ? secondary : primary} 50%)`
                : undefined,
            }}
          />
        </div>
      </div>
      <button
        type="button"
        className={page.save}
        disabled={busy || !changed || !valid(primary) || !valid(secondary)}
        onClick={() => onSave({ primary_color: primary || null, secondary_color: secondary || null })}
      >
        {busy ? "…" : "Αποθήκευση χρωμάτων"}
      </button>
    </section>
  );
}

function move<T extends { id: number }>(rows: T[], index: number, by: number): number[] {
  const ids = rows.map((r) => r.id);
  const to = index + by;
  if (to < 0 || to >= ids.length) return ids;
  [ids[index], ids[to]] = [ids[to], ids[index]];
  return ids;
}

function Photos({ slug, photos, busy, run }: { slug: string; photos: TeamPhoto[]; busy: string | null; run: Run }) {
  return (
    <section className={styles.block} aria-labelledby="look-photos">
      <h3 id="look-photos" className={styles.blockTitle}>Γκαλερί ({photos.length})</h3>
      <p className={styles.muted}>Μπορείς να διαλέξεις πολλές μαζί. Οι νέες μπαίνουν πρώτες.</p>
      <FilePick
        label="Προσθήκη φωτογραφιών"
        multiple
        busy={busy === "photo"}
        onPick={(file) => run("photo", async () => editorApi.addPhoto(slug, await shrink(file, "photo")))}
      />
      {photos.length > 0 && (
        <ul className={styles.photoGrid}>
          {photos.map((photo, i) => (
            <PhotoCard
              key={photo.id}
              photo={photo}
              first={i === 0}
              last={i === photos.length - 1}
              disabled={busy !== null}
              onCaption={(caption) => run(`caption-${photo.id}`, () => editorApi.captionPhoto(slug, photo.id, caption))}
              onMove={(by) => run("order", () => editorApi.orderPhotos(slug, move(photos, i, by)))}
              onRemove={() => {
                if (window.confirm("Διαγραφή φωτογραφίας;")) run("remove", () => editorApi.removePhoto(slug, photo.id));
              }}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function PhotoCard({
  photo,
  first,
  last,
  disabled,
  onCaption,
  onMove,
  onRemove,
}: {
  photo: TeamPhoto;
  first: boolean;
  last: boolean;
  disabled: boolean;
  onCaption: (caption: string | null) => void;
  onMove: (by: number) => void;
  onRemove: () => void;
}) {
  const [caption, setCaption] = useState(photo.caption ?? "");
  return (
    <li className={styles.photoCard}>
      {/* eslint-disable-next-line @next/next/no-img-element -- a thumbnail WebP from the API */}
      <img src={mediaUrl(photo.thumb_url)} alt={photo.caption ?? ""} className={styles.photoThumb} />
      <input
        className={`${page.input} ${styles.field}`}
        value={caption}
        placeholder="Λεζάντα (προαιρετική)"
        maxLength={200}
        onChange={(e) => setCaption(e.target.value)}
        onBlur={() => {
          if (caption.trim() !== (photo.caption ?? "")) onCaption(caption.trim() || null);
        }}
        aria-label="Λεζάντα φωτογραφίας"
      />
      <div className={styles.cardActions}>
        <button type="button" className={styles.iconButton} disabled={disabled || first} onClick={() => onMove(-1)} aria-label="Μετακίνηση αριστερά">
          ‹
        </button>
        <button type="button" className={styles.iconButton} disabled={disabled || last} onClick={() => onMove(1)} aria-label="Μετακίνηση δεξιά">
          ›
        </button>
        <button type="button" className={styles.danger} disabled={disabled} onClick={onRemove}>
          Διαγραφή
        </button>
      </div>
    </li>
  );
}

function SponsorsEditor({
  slug,
  sponsors,
  busy,
  run,
}: {
  slug: string;
  sponsors: SponsorAdmin[];
  busy: string | null;
  run: Run;
}) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileKey, setFileKey] = useState(0);

  async function add() {
    await run("sponsor-add", async () =>
      editorApi.addSponsor(slug, {
        name: name.trim(),
        website_url: withScheme(url),
        file: file ? await shrink(file, "logo") : null,
      }),
    );
    setName("");
    setUrl("");
    setFile(null);
    setFileKey((k) => k + 1);
  }

  return (
    <section className={styles.block} aria-labelledby="look-sponsors">
      <h3 id="look-sponsors" className={styles.blockTitle}>Χορηγοί ({sponsors.length})</h3>
      <p className={styles.muted}>
        Εμφανίζονται στη σελίδα του σωματείου και σε κάθε αγώνα του, με τη σειρά που ορίζεις εδώ.
      </p>

      {sponsors.length > 0 && (
        <ul className={styles.sponsorRows}>
          {sponsors.map((sponsor, i) => (
            <SponsorRow
              key={sponsor.id}
              slug={slug}
              sponsor={sponsor}
              first={i === 0}
              last={i === sponsors.length - 1}
              disabled={busy !== null}
              run={run}
              onMove={(by) => run("order", () => editorApi.orderSponsors(slug, move(sponsors, i, by)))}
            />
          ))}
        </ul>
      )}

      <form
        className={styles.sponsorAdd}
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) add();
        }}
      >
        <strong className={styles.colourLabel}>Νέος χορηγός</strong>
        <input
          className={`${page.input} ${styles.field}`}
          placeholder="Όνομα"
          value={name}
          maxLength={120}
          onChange={(e) => setName(e.target.value)}
          aria-label="Όνομα χορηγού"
          required
        />
        <input
          className={`${page.input} ${styles.field}`}
          placeholder="Ιστοσελίδα (προαιρετική)"
          value={url}
          inputMode="url"
          onChange={(e) => setUrl(e.target.value)}
          aria-label="Ιστοσελίδα χορηγού"
        />
        <label className={styles.fileLine}>
          Λογότυπο (προαιρετικό)
          <input
            key={fileKey}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </label>
        <button type="submit" className={page.save} disabled={busy !== null || !name.trim()}>
          {busy === "sponsor-add" ? "…" : "Προσθήκη χορηγού"}
        </button>
      </form>
    </section>
  );
}

/** "fournos.gr" is how people type a site; the API wants a scheme. */
function withScheme(raw: string): string | undefined {
  const text = raw.trim();
  if (!text) return undefined;
  return /^https?:\/\//i.test(text) ? text : `https://${text}`;
}

function SponsorRow({
  slug,
  sponsor,
  first,
  last,
  disabled,
  run,
  onMove,
}: {
  slug: string;
  sponsor: SponsorAdmin;
  first: boolean;
  last: boolean;
  disabled: boolean;
  run: Run;
  onMove: (by: number) => void;
}) {
  const [name, setName] = useState(sponsor.name);
  const [url, setUrl] = useState(sponsor.website_url ?? "");
  const changed = name.trim() !== sponsor.name || (withScheme(url) ?? null) !== (sponsor.website_url ?? null);
  const logo = mediaUrl(sponsor.logo_url);

  return (
    <li className={`${styles.sponsorRow} ${sponsor.is_active ? "" : styles.inactive}`}>
      <label className={styles.sponsorLogo} title="Αλλαγή λογότυπου">
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
          onChange={async (e) => {
            const picked = e.target.files?.[0];
            e.target.value = "";
            if (picked) {
              await run(`sponsor-logo-${sponsor.id}`, async () =>
                editorApi.setSponsorLogo(slug, sponsor.id, await shrink(picked, "logo")),
              );
            }
          }}
        />
      </label>
      <div className={styles.sponsorFields}>
        <input
          className={`${page.input} ${styles.field}`}
          value={name}
          maxLength={120}
          onChange={(e) => setName(e.target.value)}
          aria-label="Όνομα χορηγού"
        />
        <input
          className={`${page.input} ${styles.field}`}
          value={url}
          placeholder="Ιστοσελίδα"
          onChange={(e) => setUrl(e.target.value)}
          aria-label="Ιστοσελίδα χορηγού"
        />
      </div>
      <div className={styles.cardActions}>
        {changed && (
          <button
            type="button"
            className={page.save}
            disabled={disabled || !name.trim()}
            onClick={() =>
              run(`sponsor-${sponsor.id}`, () =>
                editorApi.saveSponsor(slug, sponsor.id, { name: name.trim(), website_url: withScheme(url) ?? null }),
              )
            }
          >
            Αποθήκευση
          </button>
        )}
        <button type="button" className={styles.iconButton} disabled={disabled || first} onClick={() => onMove(-1)} aria-label="Πιο πάνω">
          ↑
        </button>
        <button type="button" className={styles.iconButton} disabled={disabled || last} onClick={() => onMove(1)} aria-label="Πιο κάτω">
          ↓
        </button>
        <label className={styles.toggle}>
          <input
            type="checkbox"
            checked={sponsor.is_active}
            disabled={disabled}
            onChange={(e) =>
              run(`sponsor-${sponsor.id}`, () => editorApi.saveSponsor(slug, sponsor.id, { is_active: e.target.checked }))
            }
          />
          Ενεργός
        </label>
        <button
          type="button"
          className={styles.danger}
          disabled={disabled}
          onClick={() => {
            if (window.confirm(`Διαγραφή του χορηγού «${sponsor.name}»;`)) {
              run("remove", () => editorApi.removeSponsor(slug, sponsor.id));
            }
          }}
        >
          Διαγραφή
        </button>
      </div>
    </li>
  );
}
