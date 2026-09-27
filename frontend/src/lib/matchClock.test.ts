import { describe, expect, it } from "vitest";

import { matchMinute } from "./matchClock";

const KICK = Date.parse("2026-09-26T12:30:00Z"); // 15:30 Athens
const at = (min: number) => new Date(KICK + min * 60_000).toISOString();
const ev = (id: number, kind: string, created: string, minute: number | null = null) =>
  ({ id, kind, created_at: created, minute, note: null }) as never;

describe("matchMinute", () => {
  it("counts from the Σέντρα", () => {
    expect(matchMinute({ events: [ev(1, "kickoff", at(0))] }, at(0), KICK + 20 * 60_000)).toBe(20);
  });

  it("stops at half time, at the half-time entry's minute", () => {
    const events = [ev(1, "kickoff", at(0)), ev(2, "yellow", at(33), 33), ev(3, "halftime", at(47), 45)];
    expect(matchMinute({ events }, at(0), KICK + 55 * 60_000)).toBe(45);
  });

  it("runs again in the second half, from 46′", () => {
    // The yellow at 33′ sorts last by minute; it must not freeze the clock.
    const events = [
      ev(1, "kickoff", at(0)),
      ev(2, "halftime", at(47), 45),
      ev(3, "second_half", at(62), 46),
      ev(4, "yellow", at(40), 33),
    ];
    expect(matchMinute({ events }, at(0), KICK + 82 * 60_000)).toBe(65);
  });

  it("stops at full time", () => {
    const events = [ev(1, "kickoff", at(0)), ev(2, "fulltime", at(110), 93)];
    expect(matchMinute({ events }, at(0), KICK + 200 * 60_000)).toBe(93);
  });

  it("ignores a Σέντρα pressed hours before the scheduled kickoff", () => {
    // Pressed at 02:32 for a 15:30 match: counts from 15:30, not 788′.
    const events = [ev(1, "kickoff", new Date(KICK - 13 * 60 * 60_000).toISOString())];
    expect(matchMinute({ events }, at(0), KICK + 10 * 60_000)).toBe(10);
  });

  it("gives no minute rather than one past what the server accepts", () => {
    expect(matchMinute({ events: [ev(1, "kickoff", at(0))] }, null, KICK + 300 * 60_000)).toBeNull();
  });
});
