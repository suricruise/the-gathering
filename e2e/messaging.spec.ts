import type { Locator } from "@playwright/test";
import { test, expect, adminClient, userClient, signIn } from "./helpers";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import pg from "pg";
import sharp from "sharp";
import AxeBuilder from "@axe-core/playwright";
test("two authenticated browsers exchange, thread, edit, react, attach, reconnect and enforce revocation", async ({
  memberPage: page,
  member,
  browser,
}) => {
  test.setTimeout(180000);
  const connectionString = readFileSync(
    ".local-stack/database-url",
    "utf8",
  ).trim();
  if (!["localhost", "127.0.0.1"].includes(new URL(connectionString).hostname))
    throw Error("Local only");
  const db = new pg.Client({ connectionString });
  await db.connect();
  const community = randomUUID(),
    channel = randomUUID(),
    otherChannel = randomUUID();
  const suffix = randomUUID().slice(0, 8),
    email = `chatbrowser-${suffix}@example.test`,
    password = `Gathering-${randomUUID()}`;
  let otherId: string | undefined;
  const context = await browser.newContext({
    viewport: page.viewportSize() ?? { width: 390, height: 844 },
  });
  const second = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  second.on("pageerror", (e) => errors.push(e.message));
  try {
    const created = await adminClient().auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { date_of_birth: "1990-01-01" },
    });
    expect(created.error).toBeNull();
    otherId = created.data.user!.id;
    const client = userClient();
    await client.auth.signInWithPassword({ email, password });
    expect(
      (
        await client.rpc("save_my_profile", {
          p_username: `chat_${suffix}`,
          p_display_name: "Taylor Lane",
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
      "insert into public.communities(id,slug,name,visibility) values($1,$2,'Browser chat','private')",
      [community, `browserchat-${suffix}`],
    );
    await db.query(
      "insert into public.community_members(community_id,user_id,role_id) values($1,$2,'owner'),($1,$3,'member')",
      [community, member.id, otherId],
    );
    await db.query(
      "insert into public.channels(id,community_id,name,is_private) values($1,$2,'real-chat',true),($3,$2,'restricted-chat',true)",
      [channel, community, otherChannel],
    );
    await db.query(
      "insert into public.channel_permission_overrides(community_id,channel_id,user_id,can_view) values($1,$2,$3,true)",
      [community, channel, otherId],
    );
    await signIn(second, email, password);
    await second.goto(`/channels/${otherChannel}`);
    await expect(
      second.getByRole("heading", { name: "A little off the map" }),
    ).toBeVisible();
    await Promise.all([
      page.goto(`/channels/${channel}`),
      second.goto(`/channels/${channel}`),
    ]);
    for (const p of [page, second])
      await expect(p.locator(".chat-connection")).toHaveText("● Live", {
        timeout: 20000,
      });
    const compose = page.getByRole("textbox", {
      name: "Message real-chat",
      exact: true,
    });
    const composeSecond = second.getByRole("textbox", {
      name: "Message real-chat",
      exact: true,
    });
    // Stage 3: multiline/emoji/authorized mentions use the same real send pipeline.
    await compose.fill("Stage three");
    await compose.press("Shift+Enter");
    await compose.press("End");
    await page.keyboard.type("second line");
    await expect(compose).toHaveValue("Stage three\nsecond line");
    await page.getByRole("button", { name: "Choose emoji", exact: true }).click();
    await page.getByRole("button", { name: "gaming controller", exact: true }).click();
    await expect(compose).toHaveValue("Stage three\nsecond line🎮");
    await compose.press("Enter");
    await expect(second.locator(".chat-message").filter({ hasText: "second line🎮" })).toHaveCount(1);
    await compose.fill("@chat_");
    const mention = page.getByRole("option", { name: `Taylor Lane @chat_${suffix}`, exact: true });
    await expect(mention).toBeVisible();
    await compose.press("ArrowDown"); await compose.press("Enter");
    await expect(compose).toHaveValue(`@chat_${suffix} `);
    await compose.fill("");
    await compose.fill("Hello from Jordan, **live**.");
    await expect(
      second.getByText("Jordan Rivers is typing…", { exact: true }),
    ).toBeVisible();
    const sendControl = page.getByRole("button", { name: "Send message", exact: true });
    if (test.info().project.name === "mobile") await sendControl.tap();
    else await sendControl.click();
    await expect(
      second
        .locator(".chat-message")
        .filter({ hasText: "Hello from Jordan, live." }),
    ).toHaveCount(1, { timeout: 10000 });
    let firstArticle = page
      .locator(".chat-message")
      .filter({ hasText: "Hello from Jordan, live." });
    const firstId = await firstArticle.getAttribute("data-message-id");
    expect(firstId).toBeTruthy();
    firstArticle = page.locator(`[data-message-id="${firstId}"]`);
    // Stage 4: real clipboard, hover/focus toolbar, permission-gated pins and thread entry.
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.bringToFront();
    if (test.info().project.name === "desktop") {
      await firstArticle.hover();
      await expect(firstArticle.getByRole("group", { name: "Quick message actions" })).toBeVisible();
      await firstArticle.getByRole("button", { name: "Add emoji reaction", exact: true }).click();
      await firstArticle.getByRole("button", { name: "React 👀", exact: true }).click();
      await expect(second.locator(`[data-message-id="${firstId}"]`).getByRole("button", { name: "👀 reaction, 1", exact: true })).toBeVisible();
    }
    await openActions(firstArticle);
    await firstArticle.getByRole("button", { name: "Copy text", exact: true }).click();
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe("Hello from Jordan, **live**.");
    await firstArticle.getByRole("button", { name: "Copy link", exact: true }).click();
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(`http://127.0.0.1:4173/channels/${channel}?message=${firstId}`);
    await firstArticle.getByRole("button", { name: "Pin message", exact: true }).click();
    await expect(firstArticle.getByText("Pinned", { exact: true })).toBeVisible();
    await second.getByRole("button", { name: "Pinned messages", exact: true }).click();
    const peerPins = second.getByRole("dialog", { name: "Pinned messages", exact: true });
    await expect(peerPins.locator(`[data-pinned-id="${firstId}"]`)).toBeVisible();
    await expect(peerPins.getByRole("button", { name: "Unpin message" })).toHaveCount(0);
    const pinsAccessibility = await new AxeBuilder({ page: second }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    expect(pinsAccessibility.violations.map((v) => v.id)).toEqual([]);
    await second.screenshot({ path: test.info().outputPath("pinned-messages.png") });
    await firstArticle.getByRole("button", { name: "Unpin message", exact: true }).click();
    await expect(peerPins.locator(`[data-pinned-id="${firstId}"]`)).toHaveCount(0);
    await firstArticle.getByRole("button", { name: "Pin message", exact: true }).click();
    await expect(peerPins.locator(`[data-pinned-id="${firstId}"]`)).toBeVisible();
    await page.getByRole("button", { name: "Pinned messages", exact: true }).click();
    const ownerPins = page.getByRole("dialog", { name: "Pinned messages", exact: true });
    await ownerPins.getByRole("button", { name: "Unpin message", exact: true }).click();
    await expect(peerPins.locator(`[data-pinned-id="${firstId}"]`)).toHaveCount(0);
    await page.getByRole("button", { name: "Close pins", exact: true }).click();
    await firstArticle.getByRole("button", { name: "Pin message", exact: true }).click();
    await expect(peerPins.locator(`[data-pinned-id="${firstId}"]`)).toBeVisible();
    await peerPins.getByRole("link", { name: "Go to message", exact: true }).click();
    await expect(second).toHaveURL(new RegExp(`message=${firstId}`));
    await expect(second.locator(`[data-message-id="${firstId}"]`)).toHaveClass(/highlighted/);
    await firstArticle.getByRole("button", { name: "Start thread", exact: true }).click();
    await expect(page.getByRole("textbox", { name: "Thread reply", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Cancel reply", exact: true }).click();
    await composeSecond.fill("A live response from Taylor.");
    await second
      .getByRole("button", { name: "Send message", exact: true })
      .click();
    await expect(
      page.getByText("A live response from Taylor.", { exact: true }),
    ).toBeVisible();
    const incoming = second.locator(`[data-message-id="${firstId}"]`);
    await composeSecond.fill("Channel draft preserved");
    await openActions(incoming);
    await incoming.getByRole("button", { name: "Reply", exact: true }).click();
    await second.getByRole("textbox", { name: "Thread reply", exact: true }).fill("Keep this draft");
    await second.getByRole("button", { name: "Cancel reply", exact: true }).click();
    await expect(composeSecond).toHaveValue("Channel draft preserved");
    await openActions(incoming);
    await incoming.getByRole("button", { name: "Reply", exact: true }).click();
    await expect(second.getByRole("textbox", { name: "Thread reply", exact: true })).toHaveValue("Keep this draft");
    await second
      .getByRole("textbox", { name: "Thread reply", exact: true })
      .fill("Thread reply delivered live.");
    await second.getByRole("region", { name: "Message thread", exact: true })
      .getByRole("button", { name: "Send message", exact: true })
      .click();
    await expect(
      second.getByRole("textbox", { name: "Thread reply", exact: true }),
    ).toHaveValue("");
    await expect(
      second.getByText("Thread reply delivered live.", { exact: true }),
    ).toBeVisible();
    await openActions(firstArticle);
    await expect(
      firstArticle.getByRole("button", { name: "Reply · 1", exact: true }),
    ).toBeVisible();
    await firstArticle
      .getByRole("button", { name: "Reply · 1", exact: true })
      .click();
    await expect(
      page.getByText("Thread reply delivered live.", { exact: true }),
    ).toBeVisible();
    for (const p of [page, second])
      await p
        .getByRole("button", { name: "Back to channel", exact: true })
        .click();
    await openActions(firstArticle);
    await firstArticle
      .getByRole("button", { name: "Edit", exact: true })
      .click();
    await firstArticle.getByRole("textbox", { name: "Edit message", exact: true }).fill("Cancelled edit");
    await firstArticle.getByRole("button", { name: "Cancel edit", exact: true }).click();
    await expect(incoming.getByText("Cancelled edit", { exact: true })).toHaveCount(0);
    await firstArticle.getByRole("button", { name: "Edit", exact: true }).click();
    await firstArticle
      .getByRole("textbox", { name: "Edit message", exact: true })
      .fill("Edited message in real time.");
    await firstArticle
      .getByRole("button", { name: "Save edit", exact: true })
      .click();
    await expect(
      incoming.getByText("Edited message in real time.", { exact: true }),
    ).toBeVisible();
    await openActions(incoming);
    await openReactions(incoming);
    await incoming
      .getByRole("button", { name: "React 👍", exact: true })
      .click();
    await expect(
      firstArticle.getByRole("button", { name: "👍 reaction, 1", exact: true }),
    ).toBeVisible();
    // Both members contribute to the same persisted reaction; own toggles preserve the peer.
    await openActions(firstArticle);
    await openReactions(firstArticle);
    await firstArticle.getByRole("button", { name: "React 👍", exact: true }).click();
    await expect(incoming.getByRole("button", { name: "👍 reaction, 2, selected", exact: true })).toBeVisible();
    await incoming.getByRole("button", { name: "👍 reaction, 2, selected", exact: true }).click();
    await expect(firstArticle.getByRole("button", { name: "👍 reaction, 1, selected", exact: true })).toBeVisible();
    await expect(incoming.getByRole("button", { name: "👍 reaction, 1", exact: true })).toBeVisible();
    await second
      .getByRole("button", { name: "Mark read", exact: true })
      .click();
    await expect(
      firstArticle.getByText("Read by 1", { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Search channel", exact: true }).click();
    await page
      .getByRole("textbox", { name: "Search this channel", exact: true })
      .fill("Edited");
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Search results", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("region", { name: "Channel conversation", exact: true }).getByText("Edited message in real time.", { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Close search", exact: true })
      .click();
    const image = await sharp({
      create: { width: 32, height: 32, channels: 3, background: "#7350db" },
    })
      .png()
      .toBuffer();
    // A failed upload cannot silently disappear or enable Send; retry is explicit.
    await page.route("**/api/chat/upload", async (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Test upload interruption" }) }), { times: 1 });
    await page.getByRole("region", { name: "Channel conversation", exact: true }).getByLabel("Attach files", { exact: true }).setInputFiles({
      name: "party.png",
      mimeType: "image/png",
      buffer: image,
    });
    await expect(page.getByText("Test upload interruption", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Send message", exact: true })).toBeDisabled();
    await page.getByRole("button", { name: "Retry upload", exact: true }).click();
    await expect(page.getByRole("region", { name: "Channel conversation", exact: true }).locator(".chat-staged-files")).toContainText(
      "party.webp",
    );
    await expect(page.getByRole("img", { name: "Preview of party.webp", exact: true })).toBeVisible();
    // Native file drops use the identical secure upload endpoint.
    await page.getByRole("region", { name: "Channel conversation", exact: true }).locator(".chat-composer").evaluate((element) => {
      const data = new DataTransfer(); data.items.add(new File(["Squad notes"], "drop.txt", { type: "text/plain" }));
      element.dispatchEvent(new DragEvent("drop", { bubbles: true, dataTransfer: data }));
    });
    await expect(page.getByRole("region", { name: "Channel conversation", exact: true }).locator(".chat-staged-files")).toContainText("drop.txt");
    await expect(page.getByText("Ready to send", { exact: true })).toHaveCount(2);

    await compose.fill("A photo for our party.");
    await page
      .getByRole("button", { name: "Send message", exact: true })
      .click();
    const photo = second.getByRole("img", { name: "party.webp", exact: true });
    await expect(photo).toBeVisible();
    const filePath = await photo.getAttribute("src");
    expect(filePath).toMatch(/^\/api\/chat\/attachments\//);
    expect((await context.request.get(filePath!)).status()).toBe(200);
    await context.setOffline(true);
    await expect(second.locator(".chat-connection")).toHaveText("Offline");
    await compose.fill("Sent while Taylor was offline.");
    await page
      .getByRole("button", { name: "Send message", exact: true })
      .click();
    await composeSecond.fill("Retry this message once.");
    await second
      .getByRole("button", { name: "Send message", exact: true })
      .click();
    await expect(
      second.getByRole("button", { name: "Retry message", exact: true }),
    ).toBeVisible();
    await context.setOffline(false);
    await expect(second.locator(".chat-connection")).toHaveText("● Live", {
      timeout: 15000,
    });
    await expect(
      second.getByText("Sent while Taylor was offline.", { exact: true }),
    ).toHaveCount(1);
    await second
      .getByRole("button", { name: "Retry message", exact: true })
      .click();
    await expect(
      page.getByText("Retry this message once.", { exact: true }),
    ).toHaveCount(1);
    await second.reload();
    await expect(
      second.getByText("Retry this message once.", { exact: true }),
    ).toHaveCount(1);
    await second.goto(`/channels/${channel}?message=${firstId}`);
    await expect(second.locator(`[data-message-id="${firstId}"]`)).toHaveClass(
      /highlighted/,
    );
    await expect(
      second.getByRole("region", { name: "Channel conversation", exact: true }).getByText("Edited message in real time.", { exact: true }),
    ).toBeVisible();
    const taylor = page
      .locator(".chat-message")
      .filter({ hasText: "A live response from Taylor." });
    await openActions(taylor);
    await taylor
      .locator("summary")
      .filter({ hasText: /^Delete message$/ })
      .click();
    await taylor
      .getByRole("textbox", { name: "Moderation reason", exact: true })
      .fill("Browser moderation check");
    await taylor
      .getByRole("button", { name: "Confirm delete", exact: true })
      .click();
    await expect(taylor).toHaveCount(0);
    await expect(
      second.getByText("A live response from Taylor.", { exact: true }),
    ).toHaveCount(0);
    // Ordinary member reporting goes through the existing authenticated report workflow.
    await openActions(incoming);
    await expect(incoming.getByRole("button", { name: "Edit", exact: true })).toHaveCount(0);
    await expect(incoming.getByRole("button", { name: "Pin message", exact: true })).toHaveCount(0);
    await incoming.getByRole("link", { name: "Report message", exact: true }).click();
    await second.getByRole("textbox", { name: "What happened?", exact: true }).fill("Two-account interaction report test");
    await second.getByRole("button", { name: "Submit report", exact: true }).click();
    await expect(second.getByText(/Report submitted. Reference:/)).toBeVisible();
    await second.goto(`/channels/${channel}`);
    // Reopening now starts at the first unread root, not the oldest message.
    if(await second.locator(`[data-message-id="${firstId}"]`).count()===0){
      await second.getByRole('button',{name:'Load older messages',exact:true}).click();
      await expect(second.locator(`[data-message-id="${firstId}"]`)).toHaveCount(1);
    }
    await expect(second.locator(".chat-connection")).toHaveText("● Live");
    const a11y = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(
      a11y.violations.map((v) => ({
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
      path: test.info().outputPath("live-chat.png"),
      fullPage: true,
    });
    // Deleting a pinned root keeps its existing replies reachable and removes it from pins.
    await page.goto(`/channels/${channel}?message=${firstId}`);
    await expect(page.locator(".chat-connection")).toHaveText("● Live");
    await expect(page.locator(`[data-message-id="${firstId}"]`)).toHaveCount(1);
    firstArticle = page.locator(`[data-message-id="${firstId}"]`);
    await openActions(firstArticle);
    await firstArticle.locator("summary").filter({ hasText: /^Delete message$/ }).click();
    await firstArticle.getByRole("button", { name: "Cancel deletion", exact: true }).click();
    await expect(second.getByRole("region", { name: "Channel conversation", exact: true }).getByText("Edited message in real time.", { exact: true })).toBeVisible();
    await firstArticle.locator("summary").filter({ hasText: /^Delete message$/ }).click();
    await firstArticle.getByRole("button", { name: "Confirm delete", exact: true }).click();
    await expect(second.locator(`[data-message-id="${firstId}"]`).getByText("Message deleted", { exact: true })).toBeVisible();
    await second.getByRole("button", { name: "Pinned messages", exact: true }).click();
    await expect(second.getByRole("dialog", { name: "Pinned messages", exact: true }).locator(`[data-pinned-id="${firstId}"]`)).toHaveCount(0);
    await second.getByRole("button", { name: "Close pins", exact: true }).click();
    await second.locator(`[data-message-id="${firstId}"]`).getByRole("button", { name: "View thread · 1", exact: true }).click();
    await expect(second.getByText("Thread reply delivered live.", { exact: true })).toBeVisible();
    await expect(second.getByRole("textbox", { name: "Thread reply", exact: true })).toBeDisabled();
    await second.getByRole("button", { name: "Back to channel", exact: true }).click();
    const ownerClient = userClient();
    await ownerClient.auth.signInWithPassword({
      email: member.email,
      password: member.password,
    });
    expect(
      (
        await ownerClient.rpc("community_command", {
          p_operation: "ban",
          p_community: community,
          p_data: { user_id: otherId },
        })
      ).error,
    ).toBeNull();
    await expect(
      second.getByRole("heading", {
        name: "Channel access is unavailable",
        exact: true,
      }),
    ).toBeVisible({ timeout: 15000 });
    expect((await context.request.get(filePath!)).status()).toBe(404);
    expect(
      (
        await context.request.get(`/api/chat/session?channel=${channel}`)
      ).status(),
    ).toBe(403);
    expect(errors).toEqual([]);
  } finally {
    await context.close();
    await db.query("delete from public.communities where id=$1", [community]);
    if (otherId) await adminClient().auth.admin.deleteUser(otherId);
    await db.end();
  }
});

async function openActions(article: Locator) {
  if (await article.locator(".chat-message-menu").getAttribute("open") === null)
    await article.getByLabel("Message actions", { exact: true }).click();
}

async function openReactions(article: Locator) {
  const picker = article.locator(".reaction-picker");
  if (await picker.getAttribute("open") === null)
    await picker.locator("summary").click();
}
