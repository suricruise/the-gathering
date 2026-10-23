import { test as base, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
export const localStack =
  !!process.env.SUPABASE_SECRET_KEY &&
  ["localhost", "127.0.0.1"].includes(
    new URL(
      process.env.NEXT_PUBLIC_SUPABASE_URL || "http://not-configured.invalid",
    ).hostname,
  );
export function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
export function userClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
export async function signIn(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/(?:home|onboarding)$/);
}
type Member = { id: string; email: string; password: string; username: string };
export const test = base.extend<{ member: Member; memberPage: Page }>({
  member: async ({}, provide) => {
    base.skip(
      !localStack,
      "Real local Supabase services are required; hosted projects are never mutated by these tests.",
    );
    const suffix = randomUUID().slice(0, 8),
      email = `browser-${suffix}@example.test`,
      password = `Gathering-${randomUUID()}`;
    const admin = adminClient();
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { date_of_birth: "1990-01-01" },
    });
    if (error || !data.user)
      throw new Error("Could not create an adult browser-test fixture.");
    const id = data.user.id;
    const username = `browser_${suffix}`;
    try {
      const client = userClient();
      const session = await client.auth.signInWithPassword({ email, password });
      expect(session.error).toBeNull();
      const result = await client.rpc("save_my_profile", {
        p_username: username,
        p_display_name: "Jordan Rivers",
        p_bio: "Browser test profile",
        p_visibility: "private",
        p_interests: ["co-op"],
        p_games: ["minecraft"],
        p_platforms: ["pc"],
        p_complete: true,
      });
      expect(result.data).toBe(true);
      await provide({ id, email, password, username });
    } finally {
      const { data: files } = await admin.storage.from("avatars").list(id);
      if (files?.length)
        await admin.storage
          .from("avatars")
          .remove(files.map((file) => `${id}/${file.name}`));
      await admin.auth.admin.deleteUser(id);
    }
  },
  memberPage: async ({ page, member }, provide) => {
    await signIn(page, member.email, member.password);
    await provide(page);
  },
});
export { expect };
export async function verificationLink(email: string) {
  let id: string | undefined;
  await expect
    .poll(
      async () => {
        const response = await fetch("http://127.0.0.1:54324/api/v1/messages");
        const body = await response.json();
        id = body.messages?.find((message: { To: { Address: string }[] }) =>
          message.To.some((to) => to.Address === email),
        )?.ID;
        return !!id;
      },
      { timeout: 15000 },
    )
    .toBe(true);
  const message = await (
    await fetch(`http://127.0.0.1:54324/api/v1/message/${id}`)
  ).json();
  const html = message.HTML || message.Text;
  const link = html.match(
    /https?:\/\/[^\s"<>]+(?:verify|confirm)[^\s"<>]*/,
  )?.[0];
  if (!link)
    throw new Error(
      "Expected a real verification/recovery email link in local Mailpit.",
    );
  return link.replaceAll("&amp;", "&");
}
