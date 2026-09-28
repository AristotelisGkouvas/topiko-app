"use client";

import { useState } from "react";

import page from "./page.module.css";

/** "Link αναφοράς": makes (once) the sponsor's private report link and copies
 *  it, to paste into an email or a Viber message at renewal time. If the
 *  clipboard is refused, the link is shown to copy by hand. */
export function ReportLink({
  make,
  className,
}: {
  make: () => Promise<{ token: string }>;
  className?: string;
}) {
  const [state, setState] = useState<"idle" | "busy" | "copied" | "error">("idle");
  const [shown, setShown] = useState<string | null>(null);

  const go = async () => {
    setState("busy");
    try {
      const { token } = await make();
      const url = `${window.location.origin}/xorigos/${token}`;
      try {
        await navigator.clipboard.writeText(url);
        setState("copied");
        setTimeout(() => setState("idle"), 2000);
      } catch {
        setShown(url);
        setState("idle");
      }
    } catch {
      setState("error");
    }
  };

  return (
    <>
      <button type="button" className={className} onClick={go} disabled={state === "busy"}>
        {state === "copied" ? "Αντιγράφηκε" : state === "busy" ? "…" : "Link αναφοράς"}
      </button>
      {shown && (
        <input className={page.input} readOnly value={shown} onFocus={(e) => e.currentTarget.select()} aria-label="Link αναφοράς" />
      )}
      {state === "error" && <span className={page.rowError}>Δεν βγήκε το link. Ξαναδοκίμασε.</span>}
    </>
  );
}
