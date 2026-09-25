import { expect, test, type Page } from "@playwright/test";

/** Each page loads, says what it is, has one of each id, and logs no errors.
 *  The cheapest net there is for "the build works but the page is blank". */

function watch(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  return errors;
}

async function uniqueIds(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const seen = new Map<string, number>();
    document.querySelectorAll("[id]").forEach((el) => {
      seen.set(el.id, (seen.get(el.id) ?? 0) + 1);
    });
    return [...seen].filter(([, n]) => n > 1).map(([id]) => id);
  });
}

const PAGES: { path: string; heading: RegExp }[] = [
  { path: "/", heading: /Πάμε Σέντρα/ },
  { path: "/vathmologia", heading: /Βαθμολογία/ },
  { path: "/agones", heading: /Αγώνες/ },
  { path: "/somateia", heading: /Σωματεία/ },
  { path: "/skorer", heading: /Σκόρερ/ },
];

for (const { path, heading } of PAGES) {
  test(`${path} loads cleanly`, async ({ page }) => {
    const errors = watch(page);
    const response = await page.goto(path);
    expect(response?.status()).toBe(200);
    await expect(page.locator("h1").first()).toHaveText(heading);
    expect(await uniqueIds(page)).toEqual([]);
    expect(errors).toEqual([]);
  });
}

test("a club page opens from the list", async ({ page }) => {
  await page.goto("/somateia");
  const first = page.locator('a[href^="/somateia/"]').first();
  const href = await first.getAttribute("href");
  await first.click();
  await expect(page).toHaveURL(new RegExp(`${href}$`));
  // The club's own name heads its page, whatever the list called it.
  await expect(page.locator("h1").first()).not.toBeEmpty();
});

test("the old fixtures address lands on /agones", async ({ page }) => {
  await page.goto("/programma");
  await expect(page).toHaveURL(/\/agones/);
});
