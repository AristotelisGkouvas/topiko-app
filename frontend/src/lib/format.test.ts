import { describe, expect, it } from "vitest";

import {
  formatDayDate,
  formatGoalDifference,
  formatRelative,
  formatTime,
  freshness,
  matchStatusLabel,
} from "./format";

// 14:00 UTC on a Sunday in September is 17:00 in Athens (EEST, UTC+3).
const KICKOFF = "2026-09-27T14:00:00Z";

describe("kickoff times", () => {
  it("are shown in Greek time, whatever the reader's zone", () => {
    expect(formatTime(KICKOFF)).toBe("17:00");
  });

  it("drop the tonos in capitals", () => {
    expect(formatDayDate(KICKOFF)).toBe("ΚΥΡ 27/09");
  });

  it("are empty rather than 'Invalid Date' when missing or broken", () => {
    expect(formatTime(null)).toBe("");
    expect(formatTime("not a date")).toBe("");
  });
});

describe("formatRelative", () => {
  const now = Date.parse("2026-09-27T12:00:00Z");
  const ago = (seconds: number) => new Date(now - seconds * 1000).toISOString();

  it("says 'just now' under 45 seconds", () => {
    expect(formatRelative(ago(30), now)).toBe("μόλις τώρα");
  });

  it("uses the singular for one", () => {
    expect(formatRelative(ago(60), now)).toBe("πριν 1 λεπτό");
    expect(formatRelative(ago(3600), now)).toBe("πριν 1 ώρα");
  });

  it("uses the plural otherwise", () => {
    expect(formatRelative(ago(4 * 60), now)).toBe("πριν 4 λεπτά");
  });

  it("falls back to a date after a week", () => {
    expect(formatRelative(ago(8 * 86400), now)).toBe("19 Σεπτεμβρίου 2026");
  });
});

describe("freshness", () => {
  const now = Date.parse("2026-09-27T12:00:00Z");
  it("is fresh under 15 minutes, stale within a day, offline after", () => {
    expect(freshness(new Date(now - 5 * 60_000).toISOString(), now)).toBe("fresh");
    expect(freshness(new Date(now - 2 * 3600_000).toISOString(), now)).toBe("stale");
    expect(freshness(new Date(now - 2 * 86400_000).toISOString(), now)).toBe("offline");
    expect(freshness(null, now)).toBe("offline");
  });
});

describe("matchStatusLabel", () => {
  it("does not promise a past unscored fixture is still to come", () => {
    expect(matchStatusLabel("scheduled", "2020-01-01T12:00:00Z")).toBe(
      "ΧΩΡΙΣ ΑΠΟΤΕΛΕΣΜΑ",
    );
  });

  it("keeps ΠΡΟΣΕΧΩΣ for the future", () => {
    expect(matchStatusLabel("scheduled", "2999-01-01T12:00:00Z")).toBe("ΠΡΟΣΕΧΩΣ");
  });
});

it("signs a positive goal difference", () => {
  expect(formatGoalDifference(16)).toBe("+16");
  expect(formatGoalDifference(-3)).toBe("-3");
  expect(formatGoalDifference(0)).toBe("0");
});
