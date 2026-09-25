/** How often to poll, given what the reader's connection asks for.
 *
 *  A phone in data-saver mode (Chrome's `navigator.connection.saveData`, set
 *  by the reader or by the carrier) gets a third of the refreshes: a live
 *  score a minute old is fine on a 2 GB/month plan, 20 KB a minute is not. */
export function pollEvery(ms: number): number {
  if (typeof navigator === "undefined") return ms;
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } })
    .connection;
  return connection?.saveData ? ms * 3 : ms;
}
