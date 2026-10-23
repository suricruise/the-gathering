import sharp from "sharp";
import { test, expect, adminClient, userClient } from "./helpers";
import pg from "pg";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
test("administration uses real scoped metrics, audited controls, protected reports and immediate role revocation", async ({
  memberPage: page,
  member,
}, testInfo) => {
  test.setTimeout(180000);
  page.setDefaultTimeout(20000);
  const db = new pg.Client({
    connectionString: readFileSync(".local-stack/database-url", "utf8").trim(),
  });
  await db.connect();
  const suffix = randomUUID().slice(0, 8),
    name = "Admin browser " + suffix,
    secret = "Reported evidence " + suffix;
  let cid: string | undefined, peerId: string | undefined;
  let evidencePath: string | undefined;
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    await page.goto("/admin");
    await expect(
      page.getByRole("heading", { name: "Staff access required" }),
    ).toBeVisible();
    await db.query(
      "insert into private.platform_roles(user_id,role) values($1,'administrator')",
      [member.id],
    );
    await page.reload();
    await expect(
      page.getByText("Platform administrator", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText("messages 7d", { exact: true })).toBeVisible();
    const nav = page.getByRole("navigation", {
      name: "Administration sections",
    });
    await nav.getByRole("button", { name: "Communities", exact: true }).click();
    const create = page.locator("details.admin-control").filter({
      has: page.locator("summary").filter({ hasText: /^Create community$/ }),
    });
    await create.locator("summary").click();
    await create.getByLabel("Community name", { exact: true }).fill(name);
    await create.getByLabel("Community slug").fill("admin-browser-" + suffix);
    await create
      .getByLabel("Description", { exact: true })
      .fill("A real local administration browser fixture.");
    await create
      .getByLabel("Initial owner's account identifier")
      .fill(member.id);
    await create
      .getByLabel("Visibility", { exact: true })
      .selectOption("private");
    await create
      .getByLabel("Reason for this action")
      .fill("Approved local community creation.");
    await create.getByRole("button", { name: "Save create community" }).click();
    await expect(
      page.getByRole("status").filter({ hasText: "Saved." }),
    ).toBeVisible();
    cid = (
      await db.query("select id from public.communities where slug=$1", [
        "admin-browser-" + suffix,
      ])
    ).rows[0].id;
    await page
      .getByLabel("Administrative scope", { exact: true })
      .selectOption(cid!);
    await nav
      .getByRole("button", { name: "Channels & voice", exact: true })
      .click();
    const channel = createControl("Create channel");
    await channel.locator("summary").click();
    await channel.getByLabel("Channel name").fill("gaming-lounge");
    await channel
      .getByLabel("Description", { exact: true })
      .fill("A moderated voice channel.");
    await channel.getByLabel("Channel type").selectOption("voice");
    await channel.getByLabel("Order position").fill("4");
    await channel
      .getByLabel("Reason for this action")
      .fill("Prepare the community gaming lounge.");
    await channel.getByRole("button", { name: "Save create channel" }).click();
    await expect(
      page.getByRole("heading", { name: "🎧 gaming-lounge" }),
    ).toBeVisible();
    const room = page
      .locator("article.admin-record")
      .filter({ has: page.getByRole("heading", { name: "🎧 gaming-lounge" }) });
    await room.getByText("Edit channel", { exact: true }).click();
    await room.getByLabel("Disable channel or voice room").check();
    await room
      .locator("details.admin-control")
      .filter({
        has: page.locator("summary").filter({ hasText: /^Edit channel$/ }),
      })
      .getByLabel("Reason for this action")
      .fill("Disable room while conducting a review.");
    await room.getByRole("button", { name: "Save edit channel" }).click();
    await expect(
      room.getByText("Position 4 · Disabled", { exact: true }),
    ).toBeVisible();
    const auth = adminClient(),
      email = `admin-peer-${suffix}@example.test`,
      password = "Gathering-" + randomUUID();
    const result = await auth.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { date_of_birth: "1990-01-01" },
    });
    expect(result.error).toBeNull();
    peerId = result.data.user!.id;
    const peer = userClient();
    expect(
      (await peer.auth.signInWithPassword({ email, password })).error,
    ).toBeNull();
    expect(
      (
        await peer.rpc("save_my_profile", {
          p_username: "admpeer_" + suffix,
          p_display_name: "Moderation peer",
          p_bio: "Local test fixture",
          p_visibility: "private",
          p_interests: [],
          p_games: [],
          p_platforms: [],
          p_complete: true,
        })
      ).error,
    ).toBeNull();
    await db.query(
      "insert into public.community_members(community_id,user_id) values($1,$2)",
      [cid, peerId],
    );
    const textChannel = (
        await db.query(
          "select id from public.channels where community_id=$1 and name='general'",
          [cid],
        )
      ).rows[0].id,
      msg = randomUUID();
    await db.query(
      "insert into public.messages(id,channel_id,author_id,body) values($1,$2,$3,$4)",
      [msg, textChannel, peerId, secret],
    );
    const fileId = randomUUID();
    evidencePath = cid + "/" + peerId + "/" + fileId;
    const image = await sharp({
      create: { width: 8, height: 8, channels: 3, background: "#504bb6" },
    })
      .webp()
      .toBuffer();
    expect(
      (
        await auth.storage
          .from("message-files")
          .upload(evidencePath, image, { contentType: "image/webp" })
      ).error,
    ).toBeNull();
    await db.query(
      "insert into public.message_attachments(id,channel_id,message_id,author_id,storage_path,filename,mime,kind,byte_size) values($1,$2,$3,$4,$5,'reported.webp','image/webp','photo',$6)",
      [fileId, textChannel, msg, peerId, evidencePath, image.length],
    );
    const report = await peer.rpc("submit_report", {
      p_type: "message",
      p_target: msg,
      p_reason: "Review this abusive message for community safety.",
    });
    expect(report.error).toBeNull();
    await nav.getByRole("button", { name: "Reports", exact: true }).click();
    const item = page
      .locator("article.admin-record")
      .filter({ hasText: "Review this abusive message" });
    await item
      .getByText("Protected reported evidence", { exact: true })
      .click();
    await expect(item.getByText(secret, { exact: true })).toBeVisible();
    const mediaLink = item.getByRole("link", {
      name: "Open reported attachment: reported.webp",
    });
    await expect(mediaLink).toBeVisible();
    const mediaUrl = await mediaLink.getAttribute("href");
    const downloaded = await page.request.get(mediaUrl!);
    expect(downloaded.status()).toBe(200);
    expect(downloaded.headers()["cache-control"]).toBe("private, no-store");
    expect(downloaded.headers()["content-type"]).toBe("image/webp");
    await item.getByText("Review decision", { exact: true }).click();
    await item.getByLabel("Decision", { exact: true }).selectOption("actioned");
    await item.getByLabel("Remove reported content").check();
    await item
      .getByLabel("Reason for this action")
      .fill("Removed reported harassment after reviewing evidence.");
    await item.getByRole("button", { name: "Save review decision" }).click();
    await expect(
      item.getByText("message · actioned", { exact: true }),
    ).toBeVisible();
    expect(
      (await db.query("select body from public.messages where id=$1", [msg]))
        .rows[0].body,
    ).toBe("");
    await page.screenshot({
      path: testInfo.outputPath("admin-moderation.png"),
      fullPage: true,
    });
    expect(
      (
        await peer.rpc("submit_appeal", {
          p_body: "Please reconsider the removal of this message. " + suffix,
          p_case: report.data,
        })
      ).error,
    ).toBeNull();
    await nav.getByRole("button", { name: "Appeals", exact: true }).click();
    const appeal = page
      .locator("article.admin-record")
      .filter({
        hasText: "Please reconsider the removal of this message. " + suffix,
      });
    await appeal.getByText("Review appeal", { exact: true }).click();
    await appeal.getByLabel("Appeal decision").selectOption("accepted");
    await appeal
      .getByLabel("Reason for this action")
      .fill("Appeal accepted; separate access review will follow.");
    await appeal.getByRole("button", { name: "Save review appeal" }).click();
    await expect(
      appeal.getByRole("heading", { name: "Appeal · accepted" }),
    ).toBeVisible();
    await nav
      .getByRole("button", { name: "Audit history", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "case decision" }).first(),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "appeal decision" }),
    ).toBeVisible();
    await db.query("delete from private.platform_roles where user_id=$1", [
      member.id,
    ]);
    await db.query(
      "update public.community_members set role_id='member' where community_id=$1 and user_id=$2",
      [cid, member.id],
    );
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Staff access required" }),
    ).toBeVisible();
    await expect(page.getByText(secret, { exact: true })).toHaveCount(0);
    expect((await page.request.get(mediaUrl!)).status()).toBe(404);
    expect(errors).toEqual([]);
    function createControl(title: string) {
      return page.locator("details.admin-control").filter({
        has: page
          .locator("summary")
          .filter({ hasText: new RegExp("^" + title + "$") }),
      });
    }
  } finally {
    await db.query("delete from private.platform_roles where user_id=$1", [
      member.id,
    ]);
    if (cid)
      await db.query("delete from public.communities where id=$1", [cid]);
    if (evidencePath)
      await adminClient().storage.from("message-files").remove([evidencePath]);
    if (peerId)
      await db.query(
        "delete from private.moderation_cases where subject_id=$1",
        [peerId],
      );
    if (peerId) await adminClient().auth.admin.deleteUser(peerId);
    await db.end();
  }
});
