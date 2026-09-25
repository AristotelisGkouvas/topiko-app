"use client";

import { apiFetch, apiUrl } from "./api";
import type { MvpPoll } from "./types";

export { voterToken } from "./voter";

/** The ballot's half of the API.
 *
 *  A vote is tied to an opaque token this browser generates and keeps, the
 *  same way match predictions work. See `app/models/mvp.py` for why that is
 *  weaker than the accounts the design asks for, and what it would take to
 *  replace it.
 */

const base = () => apiUrl("/mvp");

export function readPoll(token: string): Promise<MvpPoll | null> {
  return apiFetch<MvpPoll | null>(
    `${base()}?voter_token=${encodeURIComponent(token)}`,
    { cache: "no-store" },
  );
}

export function castVote(
  pollId: number,
  candidateId: number,
  token: string,
): Promise<MvpPoll> {
  return apiFetch<MvpPoll>(`${base()}/${pollId}/vote`, {
    method: "POST",
    json: { candidate_id: candidateId, voter_token: token },
  });
}
