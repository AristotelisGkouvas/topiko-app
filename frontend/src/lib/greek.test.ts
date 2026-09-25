import { expect, it } from "vitest";

import { fold } from "./greek";

it("matches accented and unaccented spellings", () => {
  expect(fold("Νάκος")).toBe(fold("ΝΑΚΟΣ"));
});

it("treats final sigma as sigma", () => {
  expect(fold("Παπάς")).toBe("παπασ");
});

it("folds diaeresis", () => {
  expect(fold("Προϊστάμενος")).toBe("προισταμενοσ");
});
