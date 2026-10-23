import { test, expect } from "./helpers";
import pg from "pg";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
test("launch guards reject obsolete routes, protect health and prevent owner deletion", async ({
  memberPage: page,
  member,
}) => {
  const db = new pg.Client({
    connectionString: readFileSync(".local-stack/database-url", "utf8").trim(),
  });
  await db.connect();
  const community = randomUUID();
  try {
    const health = await page.request.get("/api/health");
    expect(health.status()).toBe(200);
    expect(await health.json()).toEqual({ status: "ok" });
    const privateHealth = await page.request.get("/api/ops/health");
    expect([401, 503]).toContain(privateHealth.status());
    const missing = await page.goto("/unknown-development-preview/path");
    expect(missing?.status()).toBe(404);
    await expect(page.getByText("Demo feed")).toHaveCount(0);
    await db.query(
      "insert into public.communities(id,slug,name) values($1,$2,'Owner deletion test')",
      [community, "launch-" + community.slice(0, 8)],
    );
    await db.query(
      "insert into public.community_members(community_id,user_id,role_id) values($1,$2,'owner')",
      [community, member.id],
    );
    await page.goto("/settings");
    await page
      .getByRole("button", { name: "Delete my account", exact: true })
      .click();
    await page
      .getByLabel("Current password for deletion", { exact: true })
      .fill(member.password);
    await page.getByLabel("Type DELETE to confirm").fill("DELETE");
    await page
      .getByRole("button", { name: "Permanently delete my account" })
      .click();
    await expect(page.getByRole("alert").filter({ hasText: "Transfer ownership" })).toBeVisible();
    expect(
      (await db.query("select id from auth.users where id=$1", [member.id]))
        .rowCount,
    ).toBe(1);
  } finally {
    await db.query("delete from public.communities where id=$1", [community]);
    await db.end();
  }
});
