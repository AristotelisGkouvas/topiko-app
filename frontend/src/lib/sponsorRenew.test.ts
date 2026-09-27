import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/editorApi", () => ({ editorApi: {} }));
vi.mock("@/lib/api", () => ({ ApiError: class {} }));

import { extend } from "@/app/admin/PlatformSponsorsAdmin";

describe("renewing a sponsor", () => {
  it("keeps to the last day of a shorter month", () => {
    expect(extend("2026-10-31", 1, "2026-10-01")).toBe("2026-11-30");
    expect(extend("2027-01-31", 1, "2026-10-01")).toBe("2027-02-28");
    expect(extend("2028-02-29", 12, "2026-10-01")).toBe("2029-02-28");
  });

  it("counts from today when the deal has already ended", () => {
    expect(extend("2026-09-16", 3, "2026-09-27")).toBe("2026-12-27");
  });
});
