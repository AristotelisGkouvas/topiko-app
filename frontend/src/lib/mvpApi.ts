"use client";

import { API_URL, ASSOCIATION } from "./api";
import type { MvpPoll } from "./types";

/** The ballot's half of the API.
 *
 *  A vote is tied to an opaque token this browser generates and keeps, the
 *  same way match predictions work. See `app/models/mvp.py` for why that is
 *  weaker than the accounts the design asks for, and what it would take to
 *  replace it.
 */

const KEY = "pamesentra:voter";
const base = () => `${API_URL}/api/v1/${ASSOCIATION}/mvp`;

/** This browser's voting token, created on first use.
 *
 *  Not derived from anything about the reader — it is a random string whose
 *  only job is to be the same one twice. Losing it means being able to vote
 *  again, which is the known cost of having no accounts.
 */
export function voterToken(): string {
  try {
    const existing = window.localStorage.getItem(KEY);
    if (existing) return existing;
    const fresh = crypto.randomUUID().replaceAll("-", "");
    window.localStorage.setItem(KEY, fresh);
    return fresh;
  } catch {
    // Storage blocked. A token that lasts for this page is still enough to
    // cast one vote and see the result.
    return crypto.randomUUID().replaceAll("-", "");
  }
}

export async function readPoll(token: string): Promise<MvpPoll | null> {
  const response = await fetch(
    `${base()}?voter_token=${encodeURIComponent(token)}`,
    { headers: { Accept: "application/json" }, cache: "no-store" },
  );
  if (!response.ok) throw new Error(String(response.status));
  return (await response.json()) as MvpPoll | null;
}

export async function castVote(
  pollId: number,
  candidateId: number,
  token: string,
): Promise<MvpPoll> {
  const response = await fetch(`${base()}/${pollId}/vote`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ candidate_id: candidateId, voter_token: token }),
  });
  if (!response.ok) {
    let detail = "Η ψήφος δεν καταχωρήθηκε.";
    try {
      const body = (await response.json()) as { detail?: string };
      if (body.detail) detail = body.detail;
    } catch {
      // A non-JSON error body is not worth failing twice over.
    }
    throw new Error(detail);
  }
  return (await response.json()) as MvpPoll;
}
