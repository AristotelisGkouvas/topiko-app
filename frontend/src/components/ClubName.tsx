import { Fragment } from "react";

/** A club name that wraps only after its dots.
 *
 *  Official names are abbreviations glued together — "Α.Ε.ΑΝΑΓΕΝΝ.ΚΕΦΑΛΟΒΡ." —
 *  with no space to wrap at, so a narrow column either overflows or, with
 *  overflow-wrap: anywhere, splits a word mid-way. A <wbr> after each dot gives
 *  the browser the natural places to break instead. */
export function ClubName({ name }: { name: string }) {
  const parts = name.split(/(?<=\.)(?=\S)/);
  return (
    <>
      {parts.map((part, i) => (
        <Fragment key={i}>
          {i > 0 && <wbr />}
          {part}
        </Fragment>
      ))}
    </>
  );
}
