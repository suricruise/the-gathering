import { test, expect, adminClient, userClient, signIn } from "./helpers";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import pg from "pg";
import AxeBuilder from "@axe-core/playwright";
async function database() {
  const connectionString = readFileSync(
    ".local-stack/database-url",
    "utf8",
  ).trim();
  if (!["localhost", "127.0.0.1"].includes(new URL(connectionString).hostname))
    throw Error("Local only");
  const db = new pg.Client({ connectionString });
  await db.connect();
  return db;
}
test("community join, accessible channel navigation, persistence, and leave", async ({
  memberPage: page,
}) => {
  await page.goto("/communities");
  await page
    .getByRole("textbox", { name: "Search communities" })
    .fill("The Gathering");
  await page
    .getByRole("link", { name: "Explore community", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Join community", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Leave community", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Leave community", exact: true }),
  ).toBeVisible();
  const nav = page.getByRole("navigation", {
    name: "Community channels",
    exact: true,
  });
  await expect(
    nav.getByRole("link", { name: "moderation", exact: true }),
  ).toHaveCount(0);
  await nav.getByRole("link", { name: "general", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "# general", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Send message unavailable" }),
  ).toBeDisabled();
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
  await page
    .getByRole("link", { name: "← The Gathering", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Leave community", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Join community", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Community channels", exact: true }),
  ).toHaveCount(0);
});
test("approved host creates private community, invites, grants private access, and bans", async ({
  memberPage: page,
  member,
  browser,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const db = await database();
  const suffix = randomUUID().slice(0, 8);
  const slug = `party-${suffix}`;
  const outsider = await browser.newContext();
  const otherPage = await outsider.newPage();
  otherPage.on("pageerror", (error) => errors.push(error.message));
  const email = `community-${suffix}@example.test`,
    password = `Gathering-${randomUUID()}`;
  let otherId: string | undefined;
  try {
    await db.query(
      "insert into private.community_creators(user_id) values($1)",
      [member.id],
    );
    await page.goto("/communities");
    await page.getByText("Create a community", { exact: true }).click();
    const create = page.locator("form").filter({
      has: page.getByRole("button", {
        name: "Create community",
        exact: true,
      }),
    });
    await create
      .getByLabel("Community name", { exact: true })
      .fill(`Private party ${suffix}`);
    await create.getByLabel("Community address").fill(slug);
    await create
      .getByLabel("Description", { exact: true })
      .fill("A private home for our gaming group.");
    await create
      .getByRole("combobox", { name: "Visibility", exact: true })
      .selectOption("private");
    await create.getByLabel("Cover artwork").selectOption("aurora");
    await create
      .getByRole("button", { name: "Create community", exact: true })
      .click();
    await create.getByRole("link", { name: "Open community" }).click();
    await expect(
      page.getByRole("heading", {
        name: `Private party ${suffix}`,
        exact: true,
      }),
    ).toBeVisible();
    await page
      .locator("summary")
      .filter({ hasText: /^Create channel$/ })
      .click();
    const channel = page.locator("form").filter({
      has: page.getByRole("button", { name: "Create channel", exact: true }),
    });
    await channel.getByLabel("Channel name").fill("secret-party");
    await channel
      .getByLabel("Channel description")
      .fill("Members with an explicit grant only.");
    await channel.getByLabel("Private channel", { exact: true }).check();
    await channel
      .getByRole("button", { name: "Create channel", exact: true })
      .click();
    const secret = page
      .getByRole("navigation", { name: "Community channels", exact: true })
      .getByRole("link", { name: /secret-party/ });
    await expect(secret).toBeVisible();
    const channelPath = await secret.getAttribute("href");
    expect(channelPath).toBeTruthy();
    const { data, error } = await adminClient().auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { date_of_birth: "1990-01-01" },
    });
    expect(error).toBeNull();
    otherId = data.user!.id;
    const client = userClient();
    await client.auth.signInWithPassword({ email, password });
    expect(
      (
        await client.rpc("save_my_profile", {
          p_username: `guest_${suffix}`,
          p_display_name: "Invited Gamer",
          p_bio: "",
          p_visibility: "private",
          p_interests: ["co-op"],
          p_games: ["minecraft"],
          p_platforms: ["pc"],
          p_complete: true,
        })
      ).data,
    ).toBe(true);
    await signIn(otherPage, email, password);
    await otherPage.goto(`/communities/${slug}`);
    await expect(
      otherPage.getByRole("heading", { name: "A little off the map" }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Create invitation link", exact: true })
      .click();
    const invite = await page
      .getByLabel("Single-use invitation link")
      .inputValue();
    await otherPage.goto(
      invite.replace("http://127.0.0.1:3000", "http://127.0.0.1:4173"),
    );
    await otherPage
      .getByRole("button", { name: "Accept invitation", exact: true })
      .click();
    await otherPage
      .getByRole("link", { name: "Open community", exact: true })
      .click();
    await expect(
      otherPage.getByRole("heading", {
        name: `Private party ${suffix}`,
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      otherPage.getByText("Community settings", { exact: true }),
    ).toHaveCount(0);
    await otherPage.goto(channelPath!);
    await expect(
      otherPage.getByRole("heading", { name: "A little off the map" }),
    ).toBeVisible();
    await page.reload();
    await page
      .getByText("Channel permission overrides", { exact: true })
      .click();
    const override = page.locator("form").filter({
      has: page.getByRole("button", {
        name: "Save permission override",
        exact: true,
      }),
    });
    await override
      .getByRole("combobox", { name: "Channel", exact: true })
      .selectOption(channelPath!.split("/").pop()!);
    await override
      .getByRole("combobox", { name: "Member target", exact: true })
      .selectOption(otherId!);
    await override
      .getByRole("button", { name: "Save permission override", exact: true })
      .click();
    await expect(override.getByRole("status")).toContainText("saved");
    await otherPage.goto(channelPath!);
    await expect(
      otherPage.getByRole("heading", { name: "# secret-party", exact: true }),
    ).toBeVisible();
    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(
      result.violations.map((v) => ({
        id: v.id,
        targets: v.nodes.map((n) => n.target),
      })),
    ).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
    await page.screenshot({
      path: `/tmp/gathering-phase4-${test.info().project.name}.png`,
      fullPage: true,
    });
    const roster = page
      .locator("li")
      .filter({ has: page.getByText("Invited Gamer", { exact: true }) });
    await roster.getByText("Manage member", { exact: true }).click();
    await roster
      .getByRole("button", { name: "Ban member", exact: true })
      .click();
    await expect(roster).toContainText("Banned");
    await otherPage.reload();
    await expect(
      otherPage.getByRole("heading", { name: "A little off the map" }),
    ).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    await outsider.close();
    await db.query("delete from public.communities where slug=$1", [slug]);
    await db.query("delete from private.community_creators where user_id=$1", [
      member.id,
    ]);
    await db.end();
    if (otherId) await adminClient().auth.admin.deleteUser(otherId);
  }
});
