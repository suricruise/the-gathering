import { test, expect, adminClient, userClient, signIn } from "./helpers";
import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
test("real friend requests, private realtime DMs, privacy, reports, mute and mutual block", async ({
  memberPage: page,
  member,
  browser,
}) => {
  test.setTimeout(180000);
  const admin = adminClient(),
    suffix = randomUUID().slice(0, 8),
    email = `people-${suffix}@example.test`,
    password = `Gathering-${randomUUID()}`;
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { date_of_birth: "1990-01-01" },
  });
  expect(created.error).toBeNull();
  const id = created.data.user!.id,
    username = `people_${suffix}`;
  const ctx = await browser.newContext({ viewport: page.viewportSize()! }),
    other = await ctx.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  other.on("pageerror", (e) => errors.push(e.message));
  try {
    const client = userClient();
    expect(
      (await client.auth.signInWithPassword({ email, password })).error,
    ).toBeNull();
    expect(
      (
        await client.rpc("save_my_profile", {
          p_username: username,
          p_display_name: "Casey People",
          p_bio: "Real browser fixture",
          p_visibility: "members",
          p_interests: ["co-op"],
          p_games: ["minecraft"],
          p_platforms: ["pc"],
          p_complete: true,
        })
      ).error,
    ).toBeNull();
    const own = userClient();
    expect(
      (
        await own.auth.signInWithPassword({
          email: member.email,
          password: member.password,
        })
      ).error,
    ).toBeNull();
    expect(
      (
        await own.rpc("save_my_profile", {
          p_username: member.username,
          p_display_name: "Jordan Rivers",
          p_bio: "Real friend fixture",
          p_visibility: "members",
          p_interests: ["co-op"],
          p_games: ["minecraft"],
          p_platforms: ["pc"],
          p_complete: true,
        })
      ).error,
    ).toBeNull();
    const privacy = {
      discoverable: true,
      allow_requests: true,
      dm_policy: "friends",
      share_presence: true,
    };
    for (const c of [client, own])
      expect(
        (
          await c.rpc("people_command", {
            p_operation: "privacy",
            p_data: privacy,
          })
        ).error,
      ).toBeNull();
    await signIn(other, email, password);
    await page.goto("/messages?tab=discover");
    await page.getByLabel("Find by username").fill(username);
    await page.getByRole("button", { name: "Search members" }).click();
    await expect(
      page.getByRole("heading", { name: "Casey People" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Message", exact: true }).click();
    await expect(
      page
        .getByRole("status")
        .filter({ hasText: "member or conversation is unavailable" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Add friend", exact: true }).click();
    await page.getByRole("button", { name: "Friends", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Cancel request" }),
    ).toBeVisible();
    await other.goto("/messages?tab=notifications");
    await expect(
      other
        .locator(".people-page")
        .getByText("Jordan Rivers sent a friend request. Unread"),
    ).toBeVisible();
    await other.getByRole("button", { name: "Manage requests" }).click();
    await other.getByRole("button", { name: "Accept request" }).click();
    await expect(
      other.getByRole("button", { name: "Remove friend" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Message", exact: true }).click();
    await expect(page).toHaveURL(/\/messages\/[a-f0-9-]{36}$/);
    const conversation = page.url().split("/").at(-1)!;
    await other.goto(`/messages/${conversation}`);
    await expect(
      page
        .getByRole("status")
        .filter({ hasText: "Live · Private conversation" }),
    ).toBeVisible();
    await expect(
      other
        .getByRole("status")
        .filter({ hasText: "Live · Private conversation" }),
    ).toBeVisible();
    const text = `Hello **party** ${suffix}`;
    await page.getByLabel("Private message", { exact: true }).fill(text);
    await page
      .getByRole("button", { name: "Send message", exact: true })
      .click();
    await expect(
      other.locator(".direct-message").filter({ hasText: suffix }),
    ).toHaveCount(1, { timeout: 25000 });
    await expect(
      other.locator(".direct-message strong").filter({ hasText: "party" }),
    ).toBeVisible();
    await other
      .getByLabel("Private message", { exact: true })
      .fill("Ready to play together.");
    await other
      .getByRole("button", { name: "Send message", exact: true })
      .click();
    await expect(
      page.getByText("Ready to play together.", { exact: true }),
    ).toBeVisible({ timeout: 25000 });
    await page.reload();
    await expect(
      page.locator(".direct-message").filter({ hasText: suffix }),
    ).toHaveCount(1);
    await other.getByRole("button", { name: "Report message" }).click();
    await other
      .getByLabel("Why are you reporting this message?")
      .fill("Browser test moderation report");
    await other.getByRole("button", { name: "Submit report" }).click();
    await expect(
      other.getByRole("status").filter({ hasText: "Report received" }),
    ).toBeVisible();
    await other.getByRole("link", { name: "All conversations" }).click();
    await other.getByRole("button", { name: "Mute", exact: true }).click();
    await expect(
      other.getByRole("button", { name: "Unmute", exact: true }),
    ).toBeVisible();
    await other.getByRole("button", { name: "Privacy", exact: true }).click();
    await other
      .getByLabel("Who may send direct messages?")
      .selectOption("nobody");
    await other.getByRole("button", { name: "Save contact privacy" }).click();
    await page.getByRole("button", { name: "Refresh messages" }).click();
    await expect(
      page.getByLabel("Private message", { exact: true }),
    ).toBeDisabled();
    await other
      .getByLabel("Who may send direct messages?")
      .selectOption("friends");
    await other.getByRole("button", { name: "Save contact privacy" }).click();
    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(
      result.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => n.target),
      })),
    ).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: test.info().outputPath("private-conversation.png"),
      fullPage: true,
    });
    other.on("dialog", (d) => d.accept());
    await other.getByRole("button", { name: "Friends", exact: true }).click();
    await other.getByRole("button", { name: "Block", exact: true }).click();
    await page.getByRole("button", { name: "Refresh messages" }).click();
    await expect(
      page.getByRole("heading", { name: "Conversation unavailable" }),
    ).toBeVisible();
    await expect(page.locator(".direct-message")).toHaveCount(0);
    expect(
      (
        await page.request.get(
          `/api/people/session?conversation=${conversation}`,
        )
      ).status(),
    ).toBe(403);
    await other.getByRole("button", { name: "Blocks", exact: true }).click();
    await expect(
      other.getByRole("button", { name: "Unblock", exact: true }),
    ).toBeVisible();
    await other.getByRole("button", { name: "Unblock", exact: true }).click();
    await other.getByRole("button", { name: "Friends", exact: true }).click();
    await expect(
      other.getByText(
        /^No friends or requests yet\./,
      ),
    ).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    await ctx.close();
    await admin.auth.admin.deleteUser(id);
  }
});
