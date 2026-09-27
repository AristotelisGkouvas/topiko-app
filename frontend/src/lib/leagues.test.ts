import { describe, expect, it, vi } from "vitest";

// leagues.ts reads the league cookie; nothing here reaches it.
vi.mock("next/headers", () => ({ cookies: vi.fn() }));

import { resolveMatchday } from "./leagues";
import type { League } from "./types";

const league = (current: number | null, total: number | null) =>
  ({ current_matchday: current, total_matchdays: total }) as League;

// A Monday and a Friday, noon in Athens.
const MON = Date.parse("2026-09-28T09:00:00Z");
const FRI = Date.parse("2026-09-25T09:00:00Z");

describe("resolveMatchday", () => {
  it("opens on the round last played early in the week", () => {
    expect(resolveMatchday({}, league(7, 26), "played", MON)).toBe(7);
  });

  it("opens on the coming round from Thursday", () => {
    expect(resolveMatchday({}, league(7, 26), "played", FRI)).toBe(8);
    expect(resolveMatchday({}, league(null, 26), "played", FRI)).toBe(1);
  });

  it("opens on the next round when asked", () => {
    expect(resolveMatchday({}, league(7, 26), "next")).toBe(8);
  });

  it("never goes past the last round", () => {
    expect(resolveMatchday({ agonistiki: "99" }, league(7, 26))).toBe(26);
    expect(resolveMatchday({}, league(26, 26), "next")).toBe(26);
  });

  it("starts at 1 before a ball is kicked", () => {
    expect(resolveMatchday({}, league(null, 26), "played", MON)).toBe(1);
  });

  it("ignores rubbish in the URL", () => {
    expect(resolveMatchday({ agonistiki: "abc" }, league(7, 26), "played", MON)).toBe(7);
    expect(resolveMatchday({ agonistiki: "0" }, league(7, 26), "played", MON)).toBe(7);
  });
});
