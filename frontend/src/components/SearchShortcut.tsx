"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** "/" opens the search, from anywhere.
 *
 *  The handoff asks for it on the desktop, where a keyboard is the pointing
 *  device and the search field is 240px in a corner. Nothing is bound on a
 *  phone, which has no key to press.
 *
 *  Guarded three ways, because "/" is also a character people type:
 *  - not while a field, textarea or contenteditable has focus;
 *  - not with a modifier held, which is somebody else's shortcut;
 *  - not when the search page is already open, where it would be a no-op that
 *    swallowed a slash the reader meant to type.
 */
export function SearchShortcut() {
  const router = useRouter();

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        target?.isContentEditable
      ) {
        return;
      }

      if (window.location.pathname.startsWith("/anazitisi")) return;

      event.preventDefault();
      router.push("/anazitisi");
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);

  return null;
}
