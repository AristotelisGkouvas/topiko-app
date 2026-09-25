"use client";

import { useSyncExternalStore } from "react";

import { apiUrl, errorDetail } from "./api";

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
  /** Who scored, when the volunteer stopped to say. Optional on purpose:
   *  a goal without a name is still a goal, and asking first is how the
   *  goal itself goes unrecorded. */
  player_name?: string;
  /** Why a match was called off. */
  note?: string;
  queued_at: number;
  /** Which door this goes through — an editor's account or a club's code.
   *
   *  Stored on the event rather than read at flush time: the queue can outlive
   *  the session that filled it, and a goal a club reported must not be
   *  retried hours later against the editor endpoint just because somebody has
   *  since logged in as one.
   */
  via?: "editor" | "ethelontis";
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
  const base = event.via === "ethelontis" ? "ethelontis" : "editor";
  return fetch(
    apiUrl(`/${base}/matches/${event.match_id}/events`),
    {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: event.client_id,
        kind: event.kind,
        team_id: event.team_id,
        minute: event.minute,
        player_name: event.player_name,
        note: event.note,
      }),
    },
  );
}

// --- what the server refused ----------------------------------------------

const REJECTED_KEY = "pamesentra:outbox:rejected";

export interface RejectedEvent extends QueuedEvent {
  /** The server's own words for why. */
  reason: string;
  rejected_at: number;
}

/** Events the server would not accept, newest last, so the screen can show
 *  what was lost and let somebody enter it again correctly. */
export function rejected(): RejectedEvent[] {
  try {
    const raw = window.localStorage.getItem(REJECTED_KEY);
    return raw ? (JSON.parse(raw) as RejectedEvent[]) : [];
  } catch {
    return [];
  }
}

function reject(event: QueuedEvent, reason: string) {
  // The last twenty are plenty for one afternoon; older ones are history.
  const kept = [...rejected(), { ...event, reason, rejected_at: Date.now() }].slice(-20);
  try {
    window.localStorage.setItem(REJECTED_KEY, JSON.stringify(kept));
  } catch {
    // Storage full or blocked: the message from flush() still says why.
  }
}

/** Forget a rejected event once somebody has dealt with it. */
export function dismissRejected(clientId: string) {
  try {
    window.localStorage.setItem(
      REJECTED_KEY,
      JSON.stringify(rejected().filter((e) => e.client_id !== clientId)),
    );
  } catch {
    // Nothing to do: the list simply stays.
  }
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

    if (response.status === 408 || response.status === 429) {
      // Timed out or throttled: nothing wrong with the event, only with the
      // moment. Kept in place and retried on the next flush.
      break;
    }

    if (response.status >= 400 && response.status < 500) {
      // The server will never accept this one — a minute of 450, a match
      // whose window has closed. Taken out of the queue, because a queue that
      // can never empty blocks everything behind it; but kept, with the
      // server's reason, rather than thrown away: "a goal was rejected" with
      // no word of which one left a volunteer unable to put it right.
      const reason = await errorDetail(response);
      drop(event.client_id);
      reject(event, reason);
      const minute = event.minute === undefined ? "" : ` (${event.minute}′)`;
      return {
        sent,
        remaining: read().length,
        blocked: `Δεν καταχωρήθηκε${minute}: ${reason}`,
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
