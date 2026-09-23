"use client";

import { useState } from "react";
import useSWR from "swr";

import { API_URL, ASSOCIATION, apiUrl } from "@/lib/api";
import styles from "./NotifyButton.module.css";

interface PushConfig {
  enabled: boolean;
  public_key: string | null;
}

const fetcher = async (url: string): Promise<PushConfig> => {
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(String(response.status));
  return response.json();
};

/** The browser wants the application server key as bytes, not base64url. */
function toKeyBytes(base64url: string): Uint8Array {
  const padded = base64url.padEnd(
    base64url.length + ((4 - (base64url.length % 4)) % 4),
    "=",
  );
  const raw = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

type State = "idle" | "working" | "on" | "denied" | "unsupported";

/** Turn on notifications for one club.
 *
 *  Asked for only when pressed. A permission prompt that appears on page load
 *  is refused by most people and cannot be asked again, so the one chance is
 *  spent on somebody who has just said they want it.
 */
export function NotifyButton({ slug, name }: { slug: string; name: string }) {
  const { data: config } = useSWR<PushConfig>(
    apiUrl("/push/config"),
    fetcher,
  );
  const [state, setState] = useState<State>("idle");
  const [error, setError] = useState<string | null>(null);

  // Not offered when the server has no keys: the prompt would be followed by
  // silence, which reads as broken rather than unconfigured.
  if (!config?.enabled || !config.public_key) return null;

  async function enable() {
    setError(null);
    setState("working");
    try {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        setState("unsupported");
        return;
      }

      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState("denied");
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        // Required by every browser: a push that nobody sees is not allowed.
        userVisibleOnly: true,
        applicationServerKey: toKeyBytes(config!.public_key!),
      });

      const json = subscription.toJSON();
      const response = await fetch(
        `${API_URL}/api/v1/${ASSOCIATION}/push/subscribe`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            endpoint: subscription.endpoint,
            p256dh: json.keys?.p256dh,
            auth: json.keys?.auth,
            team_slug: slug,
          }),
        },
      );
      if (!response.ok) throw new Error(String(response.status));
      setState("on");
    } catch {
      setError("Δεν ήταν δυνατή η ενεργοποίηση.");
      setState("idle");
    }
  }

  if (state === "unsupported") return null;

  return (
    <div className={styles.box}>
      {state === "on" ? (
        <p className={styles.done}>
          ✓ Θα ειδοποιείσαι για τα γκολ του {name}.
        </p>
      ) : (
        <>
          <button
            type="button"
            className={styles.button}
            disabled={state === "working"}
            onClick={enable}
          >
            {state === "working" ? "…" : `🔔 Ειδοποιήσεις για το ${name}`}
          </button>
          {state === "denied" && (
            <p className={styles.note}>
              Οι ειδοποιήσεις είναι αποκλεισμένες για αυτό το site. Άλλαξέ το
              από τις ρυθμίσεις του browser.
            </p>
          )}
          {error && (
            <p className={styles.note} role="alert">
              {error}
            </p>
          )}
        </>
      )}
    </div>
  );
}
