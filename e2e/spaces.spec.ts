import { test, expect, adminClient, userClient, signIn } from "./helpers";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import pg from "pg";
import AxeBuilder from "@axe-core/playwright";
test("faith privacy, generic live notifications, timezone events, RSVPs and host controls", async ({
  memberPage: page,
  member,
  browser,
}) => {
  test.setTimeout(240000);
  page.setDefaultTimeout(20000);
  const db = new pg.Client({
    connectionString: readFileSync(".local-stack/database-url", "utf8").trim(),
  });
  await db.connect();
  const admin = adminClient(),
    suffix = randomUUID().slice(0, 8),
    community = randomUUID(),
    voice = randomUUID(),
    email = `faith-${suffix}@example.test`,
    password = `Gathering-${randomUUID()}`;
  let peerId: string | undefined;
  const ctx = await browser.newContext({ viewport: page.viewportSize()! }),
    peer = await ctx.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  peer.on("pageerror", (e) => errors.push(e.message));
  const secret = `Sensitive prayer ${suffix}`,
    comment = `Private encouragement ${suffix}`,
    title = `Community game night ${suffix}`;
  try {
    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { date_of_birth: "1990-01-01" },
    });
    expect(created.error).toBeNull();
    peerId = created.data.user!.id;
    const c = userClient();
    expect(
      (await c.auth.signInWithPassword({ email, password })).error,
    ).toBeNull();
    expect(
      (
        await c.rpc("save_my_profile", {
          p_username: `faith_${suffix}`,
          p_display_name: "Casey Faith",
          p_bio: "Local browser fixture",
          p_visibility: "private",
          p_interests: ["faith"],
          p_games: ["minecraft"],
          p_platforms: ["pc"],
          p_complete: true,
        })
      ).error,
    ).toBeNull();
    await db.query(
      "insert into public.communities(id,slug,name,visibility) values($1,$2,'Faith browser community','private')",
      [community, "faith-" + suffix],
    );
    await db.query(
      "insert into public.community_members(community_id,user_id,role_id) values($1,$2,'owner'),($1,$3,'member')",
      [community, member.id, peerId],
    );
    await db.query(
      "insert into public.channels(id,community_id,name,kind) values($1,$2,'event-lounge','voice')",
      [voice, community],
    );
    await signIn(peer, email, password);
    await peer.goto("/faith");
    await peer.getByLabel("Community", { exact: true }).selectOption(community);
    await peer
      .locator("summary")
      .filter({ hasText: "Submit a prayer request" })
      .click();
    await peer.getByLabel("Your prayer request").fill(secret);
    await peer.getByLabel("Prayer visibility").selectOption("moderators");
    await peer
      .getByLabel("I agree to the kindness and confidentiality guidelines.")
      .check();
    await peer
      .getByRole("button", { name: "Submit prayer request", exact: true })
      .click();
    await expect(peer).toHaveURL(/\/faith\/[a-f0-9-]{36}$/);
    const prayer = peer.url().split("/").at(-1)!;
    await expect(peer.getByText(secret, { exact: true })).toBeVisible();
    await page.goto(`/faith/${prayer}`);
    await expect(page.getByText(secret, { exact: true })).toBeVisible();
    await page.getByLabel("Offer encouragement").fill(comment);
    await page.getByRole("button", { name: "Post encouragement" }).click();
    await expect(page.getByText(comment, { exact: true })).toBeVisible();
    await peer.goto("/notifications");
    await expect(
      peer
        .locator(".space-notification")
        .filter({ hasText: "Someone replied to your content" }),
    ).toHaveCount(1);
    await expect(peer.locator(".space-page")).not.toContainText(secret);
    await expect(peer.locator(".space-page")).not.toContainText(comment);
    await peer
      .getByLabel("Event reminders for my Going RSVPs", { exact: true })
      .check();
    await peer
      .getByRole("button", { name: "Save notification preferences" })
      .click();
    await expect(
      peer.getByRole("status").filter({ hasText: "Saved." }),
    ).toBeVisible();
    await db.query(
      "update public.community_members set role_id='member' where community_id=$1 and user_id=$2",
      [community, member.id],
    );
    expect(
      (
        await page.request.get(`/api/spaces?view=prayer&resource=${prayer}`)
      ).status(),
    ).toBe(403);
    await page.getByRole("button", { name: "Refresh", exact: true }).click();
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page.locator(".space-page")).not.toContainText(secret);
    await db.query(
      "update public.community_members set role_id='owner' where community_id=$1 and user_id=$2",
      [community, member.id],
    );
    await page.goto("/events");
    await page
      .getByRole("button", { name: "Create an event", exact: true })
      .click();
    await page.getByLabel("Event community").selectOption(community);
    await page.getByLabel("Event title").fill(title);
    await page
      .getByLabel("Event description")
      .fill("Play co-op, share good company and use the linked lounge.");
    await page.getByLabel("Gathering type").selectOption("gaming");
    await page.getByLabel("Event banner").selectOption("aurora");
    await page.getByLabel("Event time zone").fill("UTC");
    await page
      .getByLabel("Start time", { exact: true })
      .fill(new Date(Date.now() + 1800000).toISOString().slice(0, 16));
    await page
      .getByLabel("End time", { exact: true })
      .fill(new Date(Date.now() + 5400000).toISOString().slice(0, 16));
    await page.getByLabel("Linked voice room").selectOption(voice);
    await page.getByRole("button", { name: "Publish event" }).click();
    await expect(page).toHaveURL(/\/events\/[a-f0-9-]{36}$/);
    const event = page.url().split("/").at(-1)!;
    await expect(
      page.getByRole("heading", { name: title, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Open linked voice room" }),
    ).toHaveAttribute("href", `/channels/${voice}`);
    await page.goto("/home");
    const horizonEvent = page.locator(".space-upcoming-row").filter({ hasText: title });
    const badge = horizonEvent.locator(".event-date-badge");
    await expect(badge).toBeVisible();
    const start = (await db.query("select starts_at from public.events where id=$1", [event])).rows[0].starts_at.toISOString();
    expect(new Date((await badge.getAttribute("datetime"))!).toISOString()).toBe(start);
    const expectedDate = await page.evaluate(value => ({
      month: new Intl.DateTimeFormat(undefined, { month: "short" }).format(new Date(value)),
      day: new Intl.DateTimeFormat(undefined, { day: "numeric" }).format(new Date(value)),
    }), start);
    await expect(badge.locator(".event-date-month")).toHaveText(expectedDate.month);
    await expect(badge.locator(".event-date-day")).toHaveText(expectedDate.day);
    expect(await horizonEvent.evaluate(row => row.querySelector('.event-date-badge')!.getBoundingClientRect().left >= row.querySelector('.space-upcoming-details')!.getBoundingClientRect().right)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    const localized = await browser.newContext({
      locale: "fr-FR",
      timezoneId: "America/Los_Angeles", storageState: await page.context().storageState(),
    });
    try {
      const localizedPage = await localized.newPage();
      const hydrationErrors: string[] = [];
      localizedPage.on("console", message => {
        if (/hydration|hydrating|didn't match/i.test(message.text())) hydrationErrors.push(message.text());
      });
      await localizedPage.goto("http://127.0.0.1:4173/home");
      const localizedBadge = localizedPage.locator(".space-upcoming-row").filter({ hasText: title }).locator(".event-date-badge");
      await expect(localizedBadge.locator(".event-date-month")).toHaveText(new Intl.DateTimeFormat("fr-FR", { month: "short", timeZone: "America/Los_Angeles" }).format(new Date(start)));
      await expect(localizedBadge.locator(".event-date-day")).toHaveText(new Intl.DateTimeFormat("fr-FR", { day: "numeric", timeZone: "America/Los_Angeles" }).format(new Date(start)));
      expect(hydrationErrors).toEqual([]);
    } finally { await localized.close(); }
    await horizonEvent.click();
    await expect(page).toHaveURL(new RegExp(`/events/${event}$`));
    await peer.goto(`/events/${event}`);
    await expect(
      peer.getByRole("button", { name: "Edit event", exact: true }),
    ).toHaveCount(0);
    await expect(
      peer.getByRole("button", { name: "Cancel event", exact: true }),
    ).toHaveCount(0);
    await peer.getByRole("button", { name: "RSVP Going" }).click();
    await expect(
      peer.getByText("Your RSVP: going", { exact: false }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Refresh", exact: true }).click();
    await expect(
      page.getByText("1 going · Your RSVP:", { exact: false }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Edit event", exact: true }).click();
    await page.getByLabel("Event title").fill(title + " updated");
    await page.getByRole("button", { name: "Save event changes" }).click();
    await expect(
      page.getByRole("heading", { name: title + " updated", exact: true }),
    ).toBeVisible();
    await db.query("select public.deliver_event_reminders()");
    await peer.goto("/notifications");
    await expect(
      peer
        .locator(".space-notification")
        .filter({ hasText: "starts within an hour" }),
    ).toHaveCount(1);
    await expect(
      peer
        .locator(".space-notification")
        .filter({ hasText: "was updated or cancelled" }),
    ).toHaveCount(1);
    await expect(peer.locator(".space-page")).not.toContainText(title);
    const axe = await new AxeBuilder({ page: peer })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(
      axe.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => n.target),
      })),
    ).toEqual([]);
    expect(
      await peer.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await peer.screenshot({
      path: test.info().outputPath("notifications.png"),
      fullPage: true,
    });
    page.on("dialog", (d) => d.accept());
    await page
      .getByRole("button", { name: "Cancel event", exact: true })
      .click();
    await expect(page.getByText("CANCELLED", { exact: true })).toBeVisible();
    await peer.goto(`/events/${event}`);
    await expect(peer.getByText("CANCELLED", { exact: true })).toBeVisible();
    await expect(peer.getByRole("button", { name: "RSVP Going" })).toHaveCount(
      0,
    );
    await peer.goto(`/faith/${prayer}`);
    await expect(peer.getByText(secret, { exact: true })).toBeVisible();
    const prayerAxe = await new AxeBuilder({ page: peer })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(
      prayerAxe.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => n.target),
      })),
    ).toEqual([]);
    await peer.screenshot({
      path: test.info().outputPath("private-prayer.png"),
      fullPage: true,
    });
    expect(errors).toEqual([]);
  } finally {
    await ctx.close();
    await db.query("delete from public.communities where id=$1", [community]);
    if (peerId) await admin.auth.admin.deleteUser(peerId);
    await db.end();
  }
});
