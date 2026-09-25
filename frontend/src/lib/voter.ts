"use client";

const KEY = "pamesentra:voter";

/** This browser's voting token, created on first use. Shared by the match
 *  prediction and the player-of-the-matchday ballot, so both recognise the
 *  same reader.
 *
 *  Not derived from anything about the reader — it is a random string whose
 *  only job is to be the same one twice. Losing it means being able to vote
 *  again, which is the known cost of having no accounts. See
 *  `app/models/mvp.py` for what it would take to replace it.
 *
 *  Created on first use rather than at import: generating one for every reader
 *  who never votes would write to storage on a page they only read.
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
