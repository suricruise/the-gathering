import { test, expect } from "./helpers";
import pg from "pg";
import sharp from "sharp";
import { readFileSync } from "node:fs";
import { randomBytes, randomUUID } from "node:crypto";
test("community owners upload and remove private headers without exposing them", async ({ memberPage: page, member, browser }) => {
  const db = new pg.Client({ connectionString: readFileSync(".local-stack/database-url", "utf8").trim() });
  await db.connect(); const id = randomUUID(), slug = "header-"+id.slice(0,8);
  const textChannel = randomUUID(), voiceChannel = randomUUID();
  const other = await browser.newContext();
  const anonymousPage = await other.newPage();
  try {
    await db.query("insert into public.communities(id,slug,name,visibility) values($1,$2,'000 custom header test','private')", [id,slug]);
    await db.query("insert into public.community_members(community_id,user_id,role_id) values($1,$2,'owner')", [id,member.id]);
    await db.query("insert into public.channels(id,community_id,name,kind) values($1,$3,'banner-text','text'),($2,$3,'banner-voice','voice')", [textChannel,voiceChannel,id]);
    await page.goto(`/communities/${slug}`);
    await expect(page.getByRole("heading", { name: "Community header image" })).toBeVisible();
    // A real source PNG over 3 MiB exercises local resizing before the Vercel upload.
    const image = await sharp(randomBytes(1600*900*3), { raw: { width: 1600, height: 900, channels: 3 } }).png().toBuffer();
    expect(image.length).toBeGreaterThan(3*1024*1024);
    expect(image.length).toBeLessThanOrEqual(5*1024*1024);
    const uploaded = page.waitForRequest((request) => request.method() === "POST" && request.url().includes(`/api/communities/${id}/header`));
    await page.getByLabel("Header image", { exact: true }).setInputFiles({ name: "header.png", mimeType: "image/png", buffer: image });
    await page.getByRole("button", { name: "Upload header image" }).click();
    await expect(page.getByText("Community header updated.", { exact: true })).toBeVisible();
    const sentBytes = Number(await (await uploaded).headerValue("content-length"));
    expect(sentBytes).toBeGreaterThan(0);
    expect(sentBytes).toBeLessThan(3*1024*1024+64*1024);
    const header = page.getByRole("img", { name: "000 custom header test community header" });
    await expect(header).toHaveCSS("background-image", /api\/communities/);
    await page.goto("/communities");
    await expect(page.locator("article").filter({ has: page.getByRole("heading", { name: "000 custom header test" }) }).locator(".community-cover img")).toHaveAttribute("src", new RegExp(`/api/communities/${id}/header`));
    await page.goto("/home");
    const homeCard = page.locator(".lounge-featured-grid article").filter({ has: page.getByRole("heading", { name: "000 custom header test" }) });
    await expect(homeCard.locator(".community-cover img")).toHaveAttribute("src", new RegExp(`/api/communities/${id}/header`));
    for (const channel of [textChannel, voiceChannel]) {
      await page.goto(`/channels/${channel}`);
      await expect(header).toBeVisible();
      await expect(header).toHaveCSS("background-image", new RegExp(`/api/communities/${id}/header\\?v=`));
      expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
      expect(await header.evaluate(element => element.getBoundingClientRect().bottom <= document.querySelector('h1')!.getBoundingClientRect().top)).toBe(true);
      await anonymousPage.goto(`http://127.0.0.1:4173/channels/${channel}`);
      await expect(anonymousPage).toHaveURL(/\/login/);
      await expect(anonymousPage.getByRole("img", { name: "000 custom header test community header" })).toHaveCount(0);
    }
    await page.goto(`/communities/${slug}`);
    const response = await page.request.get(`/api/communities/${id}/header`);
    expect(response.status()).toBe(200); expect(response.headers()["content-type"]).toBe("image/webp");
    expect(response.headers()["cache-control"]).toContain("no-store");
    expect((await other.request.get(`http://127.0.0.1:4173/api/communities/${id}/header`)).status()).toBe(404);
    expect((await page.request.post(`/api/communities/${id}/header`, { headers: { Origin: "https://untrusted.invalid" } })).status()).toBe(403);
    await page.getByLabel("Header image", { exact: true }).setInputFiles({ name: "oversized.png", mimeType: "image/png", buffer: Buffer.alloc(6*1024*1024) });
    await page.getByRole("button", { name: "Upload header image" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "5 MB" })).toBeVisible();
    await page.getByLabel("Header image", { exact: true }).setInputFiles({ name: "fake.png", mimeType: "image/png", buffer: Buffer.from("<svg/>") });
    await page.getByRole("button", { name: "Upload header image" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "could not be read" })).toBeVisible();
    await page.reload(); await expect(header).toHaveCSS("background-image", /api\/communities/);
    await page.getByRole("button", { name: "Remove header image" }).click();
    await expect(page.getByText("Custom header removed.", { exact: true })).toBeVisible();
    await expect(header).toHaveCSS("background-image", /covers\//);
    expect((await page.request.get(`/api/communities/${id}/header`)).status()).toBe(404);
    await page.goto("/home");
    await expect(homeCard.locator(".community-cover img")).toHaveAttribute("src", /covers\//);
    for (const channel of [textChannel, voiceChannel]) {
      await page.goto(`/channels/${channel}`);
      await expect(header).toHaveCSS("background-image", /covers\//);
    }
  } finally { await other.close(); await db.query("delete from public.communities where id=$1",[id]); await db.end(); }
});
