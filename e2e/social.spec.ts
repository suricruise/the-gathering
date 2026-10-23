import { test, expect, adminClient, userClient, signIn } from "./helpers";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import pg from "pg";
import sharp from "sharp";
import AxeBuilder from "@axe-core/playwright";
test("real social sharing isolates audiences, persists media and interactions, and moderates reports", async ({
  memberPage: page,
  member,
  browser,
}) => {
  test.setTimeout(180000);
  page.setDefaultTimeout(20000);
  const connectionString = readFileSync(
    ".local-stack/database-url",
    "utf8",
  ).trim();
  if (!["localhost", "127.0.0.1"].includes(new URL(connectionString).hostname))
    throw Error("Local only");
  const db = new pg.Client({ connectionString });
  await db.connect();
  const community = randomUUID(),
    suffix = randomUUID().slice(0, 8),
    email = `social-${suffix}@example.test`,
    password = `Gathering-${randomUUID()}`;
  let otherId: string | undefined;
  const ctx = await browser.newContext({ viewport: page.viewportSize()! });
  const other = await ctx.newPage();
  other.setDefaultTimeout(20000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  other.on("pageerror", (e) => errors.push(e.message));
  const composer = (p: typeof page) => p.locator(".social-composer");
  const post = (p: typeof page, id: string) =>
    p.locator(`[data-post-id="${id}"]`);
  const publish = async (p: typeof page, text: string) => {
    await composer(p).getByLabel("Your post", { exact: true }).fill(text);
    await composer(p)
      .getByRole("button", { name: "Publish post", exact: true })
      .click();
    await expect(composer(p).getByRole("status")).toContainText("published");
    await expect(
      composer(p).getByLabel("Your post", { exact: true }),
    ).toHaveValue("");
    const card = p.locator(".social-post-list .social-post").first();
    await expect(card).toContainText(text.replaceAll("**", ""));
    return (await card.getAttribute("data-post-id"))!;
  };
  try {
    const r = await adminClient().auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { date_of_birth: "1990-01-01" },
    });
    expect(r.error).toBeNull();
    otherId = r.data.user!.id;
    const u = userClient();
    await u.auth.signInWithPassword({ email, password });
    expect(
      (
        await u.rpc("save_my_profile", {
          p_username: `social_${suffix}`,
          p_display_name: "Taylor Social",
          p_bio: "",
          p_visibility: "private",
          p_interests: ["co-op"],
          p_games: ["minecraft"],
          p_platforms: ["pc"],
          p_complete: true,
        })
      ).data,
    ).toBe(true);
    await db.query(
      "insert into public.communities(id,slug,name,visibility) values($1,$2,'Private social room','private')",
      [community, `social-${suffix}`],
    );
    await db.query(
      "insert into public.community_members(community_id,user_id,role_id) values($1,$2,'owner')",
      [community, member.id],
    );
    await db.query("insert into private.social_moderators values($1)", [
      member.id,
    ]);
    await signIn(other, email, password);
    await Promise.all([page.goto("/feed"), other.goto("/feed")]);
    await composer(page)
      .getByLabel("Game tags (up to 4)")
      .selectOption(["minecraft"]);
    await composer(page)
      .getByLabel("Interest tags (up to 4)")
      .selectOption(["co-op"]);
    const png = await sharp({
      create: { width: 20, height: 20, channels: 3, background: "#8471c7" },
    })
      .png()
      .toBuffer();
    await composer(page).getByLabel("Upload post media").setInputFiles({
      name: "development-photo.png",
      mimeType: "image/png",
      buffer: png,
    });
    await expect(page.locator(".social-staged-media")).toContainText(
      "development-photo.webp",
    );
    const first = await publish(page, "First real **Minecraft** moment.");
    await expect(post(page, first).locator(".chat-markdown strong")).toHaveText(
      "Minecraft",
    );
    const image = post(page, first).getByRole("img", {
      name: "development-photo.webp",
    });
    await expect(image).toBeVisible();
    const publicMedia = (await image.getAttribute("src"))!;
    await other
      .getByRole("button", { name: "Refresh feed", exact: true })
      .click();
    await expect(post(other, first)).toBeVisible();
    await post(other, first)
      .getByRole("button", { name: "React 👍", exact: true })
      .click();
    await expect(
      post(other, first).getByRole("button", { name: "React 👍", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await post(other, first)
      .getByRole("button", { name: "Follow", exact: true })
      .click();
    await expect(
      post(other, first).getByRole("button", {
        name: "Following",
        exact: true,
      }),
    ).toHaveAttribute("aria-pressed", "true");
    await other.getByLabel("Feed", { exact: true }).selectOption("following");
    await expect(post(other, first)).toBeVisible();
    await post(other, first)
      .getByRole("button", { name: /View comments/ })
      .click();
    await post(other, first)
      .getByLabel("Write a comment", { exact: true })
      .fill("Actual saved comment");
    await post(other, first)
      .getByRole("button", { name: "Post comment", exact: true })
      .click();
    await expect(post(other, first)).toContainText("Actual saved comment");
    await post(other, first)
      .getByRole("button", { name: "Edit comment", exact: true })
      .click();
    await post(other, first)
      .getByLabel("Edit comment", { exact: true })
      .fill("Updated saved comment");
    await post(other, first)
      .getByRole("button", { name: "Save comment", exact: true })
      .click();
    await expect(post(other, first)).toContainText("Updated saved comment");
    await page
      .getByRole("button", { name: "Refresh feed", exact: true })
      .click();
    await expect(
      post(page, first).getByRole("button", { name: "React 👍", exact: true }),
    ).toContainText("1");
    await post(page, first)
      .getByRole("button", { name: /View comments/ })
      .click();
    await expect(post(page, first)).toContainText("Updated saved comment");
    await post(page, first)
      .getByRole("button", { name: "Edit post", exact: true })
      .click();
    await post(page, first)
      .getByLabel("Edit post", { exact: true })
      .fill("Updated real **Minecraft** moment.");
    await post(page, first)
      .getByRole("button", { name: "Save post", exact: true })
      .click();
    await expect(post(page, first)).toContainText(
      "Updated real Minecraft moment.",
    );
    // A private community photo cannot be loaded by a different verified member.
    await composer(page)
      .getByLabel("Audience", { exact: true })
      .selectOption("community");
    await composer(page)
      .getByLabel("Post community", { exact: true })
      .selectOption(community);
    await composer(page).getByLabel("Upload post media").setInputFiles({
      name: "private-photo.png",
      mimeType: "image/png",
      buffer: png,
    });
    await expect(page.locator(".social-staged-media")).toContainText(
      "private-photo.webp",
    );
    const secret = await publish(page, "Private community memory");
    const privateMedia = (await post(page, secret)
      .getByRole("img", { name: "private-photo.webp" })
      .getAttribute("src"))!;
    expect((await other.request.get(privateMedia)).status()).toBe(404);
    await other.goto(`/feed/${secret}`);
    await expect(
      other.getByRole("heading", { name: "A little off the map" }),
    ).toBeVisible();
    await other.goto("/feed");
    await other.getByLabel("Feed", { exact: true }).selectOption("explore");
    await expect(post(other, secret)).toHaveCount(0);
    // Validated video is actually playable through authenticated byte-range requests.
    await composer(page)
      .getByLabel("Audience", { exact: true })
      .selectOption("followers");
    await composer(page)
      .getByLabel("I own the videos", { exact: false })
      .check();
    await composer(page)
      .getByLabel("Upload post media")
      .setInputFiles("e2e/fixtures/development-test-clip.mp4");
    await expect(page.locator(".social-staged-media")).toContainText(
      "development-test-clip.mp4",
    );
    const video = await publish(page, "Followers-only development clip");
    const videoElement = post(page, video).locator("video");
    await expect
      .poll(() =>
        videoElement.evaluate((v) => (v as HTMLVideoElement).duration),
      )
      .toBeGreaterThan(0);
    const videoUrl = (await videoElement.getAttribute("src"))!;
    await other
      .getByRole("button", { name: "Refresh feed", exact: true })
      .click();
    await expect(post(other, video)).toBeVisible();
    const range = await other.request.get(videoUrl, {
      headers: { Range: "bytes=0-15" },
    });
    expect(range.status()).toBe(206);
    expect(range.headers()["content-type"]).toBe("video/mp4");
    expect((await range.body()).length).toBe(16);
    await post(other, first)
      .getByRole("button", { name: "Following", exact: true })
      .click();
    await expect(
      post(other, first).getByRole("button", { name: "Follow", exact: true }),
    ).toHaveAttribute("aria-pressed", "false");
    await expect(post(other, video)).toHaveCount(0);
    expect((await other.request.get(videoUrl)).status()).toBe(404);
    // Membership unlocks community context, including its scoped feed route.
    await db.query(
      "insert into public.community_members(community_id,user_id,role_id) values($1,$2,'member')",
      [community, otherId],
    );
    await other.goto(`/communities/social-${suffix}/posts`);
    await expect(
      other.getByRole("heading", {
        name: "Private social room posts",
        exact: true,
      }),
    ).toBeVisible();
    const memberPost = await publish(other, "A member's community post");
    await page.goto(`/communities/social-${suffix}/posts`);
    await expect(post(page, memberPost)).toBeVisible();
    const report = post(page, memberPost).locator(".social-report");
    await report.locator("summary").click();
    await report.getByLabel("Report reason").selectOption("spam");
    await report
      .getByLabel("Report details")
      .fill("Development moderation verification");
    await report
      .getByRole("button", { name: "Submit report", exact: true })
      .click();
    await expect(post(page, memberPost)).toContainText("Report saved");
    await page
      .getByRole("button", { name: "Moderation queue", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Refresh reports", exact: true })
      .click();
    const queue = page
      .locator(".social-reports li")
      .filter({ hasText: "Development moderation verification" });
    await expect(queue).toContainText("open");
    page.once("dialog", (d) => d.accept());
    await queue.getByRole("button", { name: "Hide", exact: true }).click();
    await expect(queue).toContainText("actioned");
    await other
      .getByRole("button", { name: "Refresh feed", exact: true })
      .click();
    await expect(post(other, memberPost)).toContainText("Hidden by moderation");
    await expect(
      post(other, memberPost).getByRole("button", {
        name: "Edit post",
        exact: true,
      }),
    ).toHaveCount(0);
    await page.getByRole("button", { name: "My reports", exact: true }).click();
    await page
      .getByRole("button", { name: "Refresh reports", exact: true })
      .click();
    await expect(
      page
        .locator(".social-reports li")
        .filter({ hasText: "Development moderation verification" }),
    ).toContainText("actioned");
    await page.goto("/feed");
    await page.getByLabel("Feed", { exact: true }).selectOption("mine");
    const axe = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    expect(axe.violations).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    for (const photo of await page.locator(".social-media-grid img").all()) {
      await photo.scrollIntoViewIfNeeded();
      await expect
        .poll(() =>
          photo.evaluate((img) => (img as HTMLImageElement).naturalWidth),
        )
        .toBeGreaterThan(0);
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: test.info().outputPath("live-social-feed.png"),
      fullPage: true,
    });
    page.once("dialog", (d) => d.accept());
    await post(page, first)
      .getByRole("button", { name: "Delete post", exact: true })
      .click();
    await expect(post(page, first)).toContainText("This post was removed");
    expect((await other.request.get(publicMedia)).status()).toBe(404);
    expect(errors).toEqual([]);
  } catch (error) {
    await test.info().attach("second-account-dom", {
      body: await other
        .locator("main")
        .innerText()
        .catch(() => "unavailable"),
      contentType: "text/plain",
    });
    throw error;
  } finally {
    await ctx.close();
    await db.query("delete from public.communities where id=$1", [community]);
    if (otherId) await adminClient().auth.admin.deleteUser(otherId);
    await db.end();
  }
});
