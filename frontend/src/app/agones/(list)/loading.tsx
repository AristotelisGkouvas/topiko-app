import { TableSkeleton } from "@/components/States";

/** Shown while the server fetches — every page here waits on the API, and a
 *  blank screen after a tap reads as a tap that did not register. */
export default function Loading() {
  return <TableSkeleton />;
}
