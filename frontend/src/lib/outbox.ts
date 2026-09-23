"use client";

import { useSyncExternalStore } from "react";

import { API_URL, ASSOCIATION } from "./api";

/** Events recorded with no signal, waiting to be sent.
 *
 *  The grounds this is used at are villages in Epirus, and half of them have
 *  no reception behind the goal. Losing the afternoon's record because the
 *  phone could not reach the server is the one failure this feature cannot
 *  have, so nothing is sent directly: everything is written down first and
 *  then flushed.
 */

const KEY = "pamesentra:outbox";

export interface QueuedEvent {
  /** Chosen here, before the first attempt, and reused on every retry — which
   *  is what makes retrying safe. The server ignores a client_id it has
   *  already recorded. */
  client_id: string;
  match_id: number;
  kind: string;
  team_id?: number;
  minute?: number;
  queued_at: number;
}

function read(): QueuedEvent[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as QueuedEvent[]) : [];
  } catch {
    // Unreadable or hand-edited. Treated as empty rather than thrown, so a
    // corrupt queue cannot brick the screen mid-match.
    return [];
  }
}

// Subscribers, so the screen shows the queue shrinking without polling it.
const listeners = new Set<() => void>();
let size = 0;

function write(queue: QueuedEvent[]) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(queue));
  } catch {
    // Storage full or blocked. The event is still in memory for this attempt.
  }
  size = queue.length;
  listeners.forEach((l) => l());
}

export function pending(): QueuedEvent[] {
  return read();
}

export function enqueue(event: Omit<QueuedEvent, "queued_at">): QueuedEvent {
  const queued: QueuedEvent = { ...event, queued_at: Date.now() };
  write([...read(), queued]);
  return queued;
}

function drop(clientId: string) {
  write(read().filter((e) => e.client_id !== clientId));
}

async function send(event: QueuedEvent): Promise<Response> {
  return fetch(
    `${API_URL}/api/v1/${ASSOCIATION}/editor/matches/${event.match_id}/events`,
    {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: event.client_id,
        kind: event.kind,
        team_id: event.team_id,
        minute: event.minute,
      }),
    },
  );
}

export interface FlushResult {
  sent: number;
  remaining: number;
  /** Set when the queue stopped because something was wrong with the request
   *  itself rather than with the network. */
  blocked?: string;
}

/** Send whatever is waiting, oldest first.
 *
 *  Stops at the first failure rather than skipping past it. The queue is a
 *  timeline — a goal, then half time, then another goal — and delivering it
 *  out of order would put the interval score in the wrong place.
 */
export async function flush(): Promise<FlushResult> {
  const queue = read();
  let sent = 0;

  for (const event of queue) {
    let response: Response;
    try {
      response = await send(event);
    } catch {
      // No network. Everything from here stays queued, in order.
      break;
    }

    if (response.ok) {
      drop(event.client_id);
      sent += 1;
      continue;
    }

    if (response.status === 401 || response.status === 403) {
      // The session lapsed while the phone was out of range. Kept, because
      // logging back in is all that is needed and the record is not wrong.
      return { sent, remaining: read().length, blocked: "Χρειάζεται σύνδεση." };
    }

    if (response.status >= 400 && response.status < 500) {
      // The server will never accept this one — a match that no longer
      // exists, a team that is not in it. Dropped rather than retried for
      // ever, because a queue that can never empty blocks everything behind
      // it.
      drop(event.client_id);
      return {
        sent,
        remaining: read().length,
        blocked: "Ένα γεγονός απορρίφθηκε και αφαιρέθηκε.",
      };
    }

    // 5xx: the server's problem, and probably temporary.
    break;
  }

  return { sent, remaining: read().length };
}

export function newClientId(): string {
  return crypto.randomUUID().replace(/-/g, "");
}


// --- reading the queue and the radio from React --------------------------
//
// Both are external state that changes without React being involved, which is
// what useSyncExternalStore is for. Reading them in an effect and calling
// setState would work and would also re-render twice on every mount.

function subscribeOutbox(listener: () => void): () => void {
  if (listeners.size === 0) size = read().length;
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** How many events are still waiting. */
export function useOutboxSize(): number {
  return useSyncExternalStore(
    subscribeOutbox,
    () => size,
    // The server has no queue and no storage to read one from.
    () => 0,
  );
}

function subscribeOnline(listener: () => void): () => void {
  window.addEventListener("online", listener);
  window.addEventListener("offline", listener);
  return () => {
    window.removeEventListener("online", listener);
    window.removeEventListener("offline", listener);
  };
}

/** Whether the browser thinks it has a connection.
 *
 *  Only a hint. `navigator.onLine` reports the radio, not whether anything is
 *  reachable — a phone can be firmly "online" on one bar behind a hill and
 *  reach nothing at all. The queue, not this, is what makes recording safe.
 */
export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
}
