import { test, expect } from "./helpers";
import AxeBuilder from "@axe-core/playwright";
for (const route of ["/", "/login", "/register", "/forgot-password"])
  test(`public ${route} is responsive and accessible`, async ({ page }) => {
    await page.goto(route);
    await expect(page.locator("h1")).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(
      result.violations.map((v) => ({
        id: v.id,
        targets: v.nodes.map((n) => n.target),
      })),
    ).toEqual([]);
  });
for (const route of [
  "/home",
  "/channels/general",
  "/voice",
  "/communities",
  "/squad-up",
  "/feed",
  "/events",
  "/faith",
  "/messages",
  "/profile",
  "/settings",
  "/admin",
])
  test(`authenticated ${route} is responsive and accessible`, async ({
    memberPage: page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(route);
    await expect(page.locator("h1")).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(
      result.violations.map((v) => ({
        id: v.id,
        targets: v.nodes.map((n) => n.target),
      })),
    ).toEqual([]);
    expect(errors).toEqual([]);
  });
test("protected routes reject an anonymous browser", async ({ page }) => {
  for (const route of [
    "/home",
    "/profile",
    "/settings",
    "/channels/general",
    "/onboarding",
  ]) {
    await page.goto(route);
    await expect(page).toHaveURL(/\/login\?/);
    await expect(
      page.getByRole("heading", { name: "Welcome back." }),
    ).toBeVisible();
  }
});
test("navigation, disconnected services, and keyboard skip link", async ({
  memberPage: page,
}, info) => {
  await page.goto("/home");
  await expect(page.locator("h1")).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Skip to content" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main-content")).toBeFocused();
  await page.goto("/communities/the-gathering");
  await page
    .getByRole("button", { name: "Join community", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Leave community", exact: true }),
  ).toBeVisible();
  if (info.project.name === "mobile") {
    await page
      .getByRole("button", { name: "Open navigation", exact: true })
      .click();
    await page
      .getByRole("dialog", { name: "All pages" })
      .getByRole("link", { name: "Text channels" })
      .click();
    await page
      .getByRole("navigation", { name: "Community channels", exact: true })
      .getByRole("link", { name: "general", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Open channels", exact: true })
      .click();
    await page
      .getByRole("dialog", { name: "Channels", exact: true })
      .getByRole("link", { name: /introductions/ })
      .click();
  } else {
    await page
      .getByRole("navigation", { name: "Main navigation", exact: true })
      .getByRole("link", { name: "Text channels" })
      .click();
    await page
      .getByRole("navigation", { name: "Community channels", exact: true })
      .getByRole("link", { name: /introductions/ })
      .click();
  }
  await expect(
    page.getByRole("heading", { name: "# introductions", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Send message", exact:true }),
  ).toBeDisabled();
  await page.goto("/voice");
  for (const button of await page
    .getByRole("button", { name: "Voice unavailable" })
    .all())
    await expect(button).toBeDisabled();
});
