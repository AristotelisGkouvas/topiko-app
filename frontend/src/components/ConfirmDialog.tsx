"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";

import styles from "./ConfirmDialog.module.css";

/** The site's own "are you sure?", in place of window.confirm.
 *
 *  The browser's box is headed with the host name — "178-238-227-37.sslip.io"
 *  — in the browser's own look, and on a phone it reads as a warning from
 *  somewhere else. This one is a <dialog>: it traps focus, answers Esc with
 *  "no", and hands focus back where it was.
 *
 *  Called like the original, but awaited:
 *
 *      if (!(await confirm("Αποσύνδεση;"))) return;
 *
 *  One dialog for the whole site, mounted once by <ConfirmHost />.
 */
interface Request {
  question: string;
  detail?: string;
  confirmLabel: string;
  danger: boolean;
  resolve: (answer: boolean) => void;
}

let current: Request | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

export function confirm(
  question: string,
  options: { detail?: string; confirmLabel?: string; danger?: boolean } = {},
): Promise<boolean> {
  // A second question while one is open answers the first with "no".
  current?.resolve(false);
  return new Promise((resolve) => {
    current = {
      question,
      detail: options.detail,
      confirmLabel: options.confirmLabel ?? "Ναι",
      danger: options.danger ?? false,
      resolve,
    };
    emit();
  });
}

function answer(value: boolean) {
  const request = current;
  current = null;
  emit();
  request?.resolve(value);
}

export function ConfirmHost() {
  const request = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current,
    () => null,
  );
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (request && !el.open) el.showModal();
    if (!request && el.open) el.close();
  }, [request]);

  return (
    <dialog
      ref={dialog}
      className={styles.dialog}
      aria-labelledby="confirm-question"
      // Esc closes the dialog; that is a "no".
      onClose={() => {
        if (current) answer(false);
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) answer(false);
      }}
    >
      {request && (
        <>
          <p id="confirm-question" className={styles.question}>
            {request.question}
          </p>
          {request.detail && <p className={styles.detail}>{request.detail}</p>}
          <div className={styles.buttons}>
            <button type="button" className={styles.cancel} onClick={() => answer(false)} autoFocus>
              Άκυρο
            </button>
            <button
              type="button"
              className={request.danger ? styles.danger : styles.ok}
              onClick={() => answer(true)}
            >
              {request.confirmLabel}
            </button>
          </div>
        </>
      )}
    </dialog>
  );
}
