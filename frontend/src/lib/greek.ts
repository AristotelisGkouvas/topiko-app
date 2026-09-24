/** Greek text folded for comparison.
 *
 *  The browser half of `app/services/greek.py`. Somebody searching a roster
 *  types "ναкος" without the accent, because phone keyboards make accents work
 *  and nobody bothers — and the register holds "ΝΑΚΟΣ". A plain `includes`
 *  finds nothing and the reader concludes the player is not there.
 *
 *  The two halves must agree. They are small and each is used on its own side,
 *  so they are kept as two rather than shipped from one — but the table below
 *  is the same table.
 */
const ACCENTED = "άέήίόύώϊϋΐΰς";
const PLAIN = "αεηιουωιυιυσ";

const MAP = new Map<string, string>(
  [...ACCENTED].map((char, i) => [char, PLAIN[i]]),
);

export function fold(text: string): string {
  return [...text.toLowerCase()].map((char) => MAP.get(char) ?? char).join("");
}
