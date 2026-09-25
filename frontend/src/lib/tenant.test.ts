import { describe, expect, it } from "vitest";

import { DEFAULT_ASSOCIATION, associationForHost, isAssociationSlug } from "./tenant";

const MAP = "epsip.pamesentra.gr=epsip-ipeirou, epsa.pamesentra.gr = epsa";

describe("associationForHost", () => {
  it("maps a configured host to its federation", () => {
    expect(associationForHost("epsa.pamesentra.gr", MAP)).toBe("epsa");
  });

  it("ignores the port and the case", () => {
    expect(associationForHost("EPSA.pamesentra.gr:3000", MAP)).toBe("epsa");
  });

  it("falls back to the default for an unknown host", () => {
    expect(associationForHost("localhost:3000", MAP)).toBe(DEFAULT_ASSOCIATION);
  });

  it("falls back when nothing is configured", () => {
    expect(associationForHost("epsa.pamesentra.gr", undefined)).toBe(DEFAULT_ASSOCIATION);
  });

  it("refuses a slug that could not have come from us", () => {
    expect(associationForHost("x.gr", "x.gr=../admin")).toBe(DEFAULT_ASSOCIATION);
  });
});

it("recognises a slug", () => {
  expect(isAssociationSlug("epsip-ipeirou")).toBe(true);
  expect(isAssociationSlug("EPSIP")).toBe(false);
  expect(isAssociationSlug(null)).toBe(false);
});
