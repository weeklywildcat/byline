import { expect, test } from "@playwright/test";
for (const width of [1920, 1440, 1366, 1180, 820, 390])
  test(`shared Staff and Author presentation at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/staff/");
    const card = page
      .locator(".author-card")
      .filter({ hasText: "Weekly Wildcat Staff" });
    await expect(card).toBeVisible();
    await expect(card.locator("a")).toHaveAttribute(
      "href",
      "/author/weekly-wildcat-staff/",
    );
    await expect(card.locator(".author-avatar-fallback")).toHaveText("W");
    expect(
      Math.round((await card.locator(".author-avatar").boundingBox())!.width),
    ).toBe(width <= 640 ? 58 : 72);
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth + 1,
      ),
    ).toBe(true);
    await card.locator("a").click();
    await expect(page.locator(".author-profile h1")).toHaveText(
      "Weekly Wildcat Staff",
    );
    await expect(page.locator(".author-bio")).toHaveText(
      "Student journalists serving the Ninety Six community.",
    );
    expect(
      Math.round(
        (await page.locator(".author-profile .author-avatar").boundingBox())!
          .width,
      ),
    ).toBe(width <= 640 ? 104 : 132);
    await expect(page.locator('meta[property="og:type"]')).toHaveAttribute(
      "content",
      "profile",
    );
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      /\/author\/weekly-wildcat-staff\/$/,
    );
    const schema = JSON.parse(
      (await page.locator("#author-json-ld").textContent())!,
    );
    expect(schema.mainEntity["@type"]).toBe("Person");
    expect(schema.mainEntity.name).toBe("Weekly Wildcat Staff");
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth + 1,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`public-author-${width}.png`),
      fullPage: true,
    });
  });

for (const width of [1440, 390])
  test(`article byline and end-of-story author retain their avatar geometry at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/2026/08/20/news/weekly-wildcat-fixture-story/");
    const byline = page.locator(".article-byline-avatar").first();
    const author = page.locator(".about-writer-avatar").first();
    await expect(byline).toBeVisible();
    await expect(author).toBeVisible();
    expect(Math.round((await byline.boundingBox())!.width)).toBe(
      width <= 640 ? 40 : 48,
    );
    expect(Math.round((await author.boundingBox())!.width)).toBe(
      width <= 640 ? 64 : 76,
    );
    await expect(page.locator(".about-writer")).toContainText(
      "Weekly Wildcat Staff",
    );
  });
