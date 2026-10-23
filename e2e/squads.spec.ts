import { test, expect, adminClient, userClient, signIn } from "./helpers";
import { randomUUID } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import pg from "pg";
import AxeBuilder from "@axe-core/playwright";
test.use({
  launchOptions: {
    executablePath:
      process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ??
      (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined),
    args: [
      "--allow-loopback-in-peer-connection",
      "--autoplay-policy=no-user-gesture-required",
    ],
  },
});
test("real Squad Up approves members, connects isolated voice, cancels, expires and protects community nights", async ({
  memberPage: page,
  member,
  browser,
}) => {
  test.setTimeout(240000);
  page.setDefaultTimeout(20000);
  const url = readFileSync(".local-stack/database-url", "utf8").trim();
  if (!["localhost", "127.0.0.1"].includes(new URL(url).hostname))
    throw Error("Local only");
  const db = new pg.Client({ connectionString: url });
  await db.connect();
  const suffix = randomUUID().slice(0, 8),
    community = randomUUID(),
    email = `squad-${suffix}@example.test`,
    password = `Gathering-${randomUUID()}`;
  let otherId: string | undefined;
  const ctx = await browser.newContext({ viewport: page.viewportSize()! });
  const other = await ctx.newPage();
  other.setDefaultTimeout(20000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  other.on("pageerror", (e) => errors.push(e.message));
  const title = `Minecraft party ${suffix}`;
  const sessionIds: string[] = [];
  const token = (p: typeof page, id: string) =>
    p.request.post("/api/voice/token", {
      headers: { Origin: "http://127.0.0.1:4173" },
      data: { channel: id },
    });
  async function create(name: string, options: { night?: boolean } = {}) {
    await page.goto("/squad-up");
    await page
      .getByRole("button", { name: "Create a session", exact: true })
      .click();
    const form = page.locator(".squad-create");
    await form.getByLabel("Session title", { exact: true }).fill(name);
    await form.getByLabel("Game", { exact: true }).selectOption("minecraft");
    await form.getByLabel("Host platform", { exact: true }).selectOption("pc");
    await form
      .getByLabel("Maximum players", { exact: true })
      .fill(options.night ? "4" : "2");
    await form
      .getByLabel("Session description", { exact: true })
      .fill("Ready for **co-op**? Bring good comms.");
    await form.getByLabel("Allow supported cross-play").check();
    if (options.night) {
      await form.getByLabel("Session audience").selectOption("community");
      await form.getByLabel("Session community").selectOption(community);
      await form.getByLabel("List as a community game night").check();
      await form
        .getByLabel("Scheduled start (optional)")
        .fill(new Date(Date.now() + 86400000).toISOString().slice(0, 16));
    } else await form.getByLabel("Approve members before they join").check();
    if (!sessionIds.length) {
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
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({
        path: test.info().outputPath("squad-up-create.png"),
        fullPage: true,
      });
    }
    await form
      .getByRole("button", { name: "Create session", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Your session is ready." }),
    ).toBeVisible();
    const link = page.getByRole("link", { name: "Open your session" });
    const href = (await link.getAttribute("href"))!;
    const id = href.split("/").at(-1)!;
    sessionIds.push(id);
    await link.click();
    await expect(
      page.getByRole("heading", { name, exact: true, level: 1 }),
    ).toBeVisible();
    return id;
  }
  try {
    const result = await adminClient().auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { date_of_birth: "1990-01-01" },
    });
    expect(result.error).toBeNull();
    otherId = result.data.user!.id;
    const client = userClient();
    await client.auth.signInWithPassword({ email, password });
    expect(
      (
        await client.rpc("save_my_profile", {
          p_username: `squad_${suffix}`,
          p_display_name: "Taylor Squad",
          p_bio: "",
          p_visibility: "private",
          p_interests: ["co-op"],
          p_games: ["minecraft"],
          p_platforms: ["xbox"],
          p_complete: true,
        })
      ).data,
    ).toBe(true);
    await db.query(
      "insert into public.communities(id,slug,name,visibility) values($1,$2,'Private gaming nights','private')",
      [community, "night-" + suffix],
    );
    await db.query(
      "insert into public.community_members(community_id,user_id,role_id) values($1,$2,'owner')",
      [community, member.id],
    );
    await signIn(other, email, password);
    const id = await create(title);
    await expect(
      page.locator(".squad-detail .chat-markdown strong"),
    ).toHaveText("co-op");
    await other.goto("/squad-up");
    await other
      .getByLabel("Filter game", { exact: true })
      .selectOption("minecraft");
    const card = other.locator(`[data-session-id="${id}"]`);
    await expect(card).toContainText("Private host");
    await expect(card).not.toContainText("Jordan Rivers");
    await card.getByRole("link", { name: "View & join" }).click();
    await expect(other.locator(".squad-roster")).toHaveCount(0);
    await other
      .getByLabel("Your platform", { exact: true })
      .selectOption("xbox");
    await other
      .getByRole("button", { name: "Request to join", exact: true })
      .click();
    await expect(other.locator(".squad-pending")).toContainText("pending");
    expect((await token(other, id)).status()).toBe(403);
    await page
      .getByRole("button", { name: "Refresh session", exact: true })
      .click();
    const pending = page.locator(`[data-member-id="${otherId}"]`);
    await expect(pending).toContainText("pending");
    await pending.getByRole("button", { name: "Approve", exact: true }).click();
    await expect(page.locator(".squad-detail-header")).toContainText(
      "2/2 reserved",
    );
    await other
      .getByRole("button", { name: "Refresh session", exact: true })
      .click();
    await expect(other.locator(".squad-joined")).toBeVisible();
    const room = (p: typeof page) =>
      p.getByRole("region", { name: `${title} voice room`, exact: true });
    await room(page)
      .getByRole("button", { name: "Join muted", exact: true })
      .click();
    await expect(page.locator(".voice-live-state")).toHaveText(
      "Voice connected",
    );
    await room(other)
      .getByRole("button", { name: "Join muted", exact: true })
      .click();
    await expect(other.locator(".voice-live-state")).toHaveText(
      "Voice connected",
    );
    await expect(
      room(page).getByRole("heading", { name: "Connected participants (2)" }),
    ).toBeVisible();
    const navigation = page.getByRole("navigation", {
      name: "Main navigation",
      exact: true,
    });
    if (await navigation.isVisible())
      await navigation.getByRole("link", { name: "Home", exact: true }).click();
    else {
      const home = page
        .getByRole("navigation", { name: "Mobile navigation" })
        .getByRole("link", { name: "Home", exact: true });
      await home.focus();
      await page.keyboard.press("Enter");
    }
    await expect(page).toHaveURL(/\/home$/);
    const back = page.getByRole("link", {
      name: "Open squad voice room",
      exact: true,
    });
    await expect(back).toHaveAttribute("href", `/squad-up/${id}`);
    await back.click();
    await expect(page.locator(".voice-live-state")).toHaveText(
      "Voice connected",
    );
    await other
      .getByRole("button", { name: "Withdraw from session", exact: true })
      .click();
    await expect(
      other.getByRole("status").filter({ hasText: "You have withdrawn" }),
    ).toBeVisible();
    await expect(other.locator(".voice-live-state")).toHaveCount(0);
    await page
      .getByRole("button", { name: "Refresh session", exact: true })
      .click();
    await expect(page.locator(".squad-detail-header")).toContainText(
      "1/2 reserved",
    );
    await other
      .getByRole("button", { name: "Request to join", exact: true })
      .click();
    await expect(other.locator(".squad-pending")).toBeVisible();
    await page
      .getByRole("button", { name: "Refresh session", exact: true })
      .click();
    await pending.getByRole("button", { name: "Approve", exact: true }).click();
    await other
      .getByRole("button", { name: "Refresh session", exact: true })
      .click();
    await room(other)
      .getByRole("button", { name: "Join muted", exact: true })
      .click();
    await expect(other.locator(".voice-live-state")).toHaveText(
      "Voice connected",
    );
    page.once("dialog", (d) => d.accept());
    await page
      .getByRole("button", { name: "Cancel session", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Session cancelled", exact: true }),
    ).toBeVisible();
    await expect(other.locator(".voice-live-state")).toHaveCount(0);
    expect((await token(other, id)).status()).toBe(403);
    const night = await create("Community night " + suffix, { night: true });
    await other.goto(`/squad-up/${night}`);
    await expect(
      other.getByRole("heading", { name: "A little off the map" }),
    ).toBeVisible();
    expect((await token(other, night)).status()).toBe(403);
    await db.query(
      "insert into public.community_members(community_id,user_id,role_id) values($1,$2,'member')",
      [community, otherId],
    );
    await other.goto(`/squad-up/${night}`);
    await other
      .getByRole("button", { name: "Join session", exact: true })
      .click();
    await expect(other.locator(".squad-joined")).toBeVisible();
    await expect(
      other.getByRole("heading", { name: "Voice is not available yet" }),
    ).toBeVisible();
    expect((await token(other, night)).status()).toBe(403);
    await page.goto("/squad-up");
    await page.getByLabel("Session listing").selectOption("game-nights");
    await page.getByLabel("Filter session community").selectOption(community);
    await expect(page.locator(`[data-session-id="${night}"]`)).toContainText(
      "Community game night",
    );
    await expect(
      page.getByRole("button", { name: "Refresh sessions", exact: true }),
    ).toBeEnabled();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: test.info().outputPath("squad-up-directory.png"),
      fullPage: true,
    });
    const axe = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(
      axe.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => n.target),
      })),
    ).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await db.query(
      "update public.gaming_sessions set created_at=now()-interval '2 days',expires_at=clock_timestamp()-interval '1 second' where id=$1",
      [night],
    );
    await other
      .getByRole("button", { name: "Refresh session", exact: true })
      .click();
    await expect(
      other.getByRole("heading", { name: "Session expired", exact: true }),
    ).toBeVisible();
    expect((await token(other, night)).status()).toBe(403);
    await other.screenshot({
      path: test.info().outputPath("squad-up-details.png"),
      fullPage: true,
    });
    const detailAxe = await new AxeBuilder({ page: other })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    expect(
      detailAxe.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => n.target),
      })),
    ).toEqual([]);
    expect(errors).toEqual([]);
  } finally {
    await ctx.close();
    await db.query(
      "delete from private.squad_audit where session_id=any($1::uuid[])",
      [sessionIds],
    );
    await db.query("delete from public.communities where id=$1", [community]);
    if (otherId) await adminClient().auth.admin.deleteUser(otherId);
    await db.end();
  }
});
