import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!url || !["127.0.0.1", "localhost"].includes(new URL(url).hostname))
  throw new Error(
    "Integration tests require an explicitly configured LOCAL Supabase stack. Hosted projects are not modified.",
  );
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const admin = createClient(url, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const client = () =>
  createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
const a = client(),
  b = client(),
  anon = client();
const suffix = randomUUID().slice(0, 8),
  password = `Secure-${randomUUID()}`;
let aId,
  bId,
  count = 0,
  avatar;
async function check(label, fn) {
  await fn();
  console.log(`PASS ${label}`);
  count++;
}
try {
  const aEmail = `integration-a-${suffix}@example.test`,
    bEmail = `integration-b-${suffix}@example.test`;
  await check(
    "real Auth signup creates an unverified adult account",
    async () => {
      const { data, error } = await a.auth.signUp({
        email: aEmail,
        password,
        options: { data: { date_of_birth: "1990-01-01" } },
      });
      assert.equal(error, null);
      assert.ok(data.user);
      assert.equal(data.session, null);
      aId = data.user.id;
    },
  );
  await check("unverified account cannot log in", async () => {
    const { error } = await a.auth.signInWithPassword({
      email: aEmail,
      password,
    });
    assert.ok(error);
  });
  await check(
    "direct Auth API cannot bypass the database age gate",
    async () => {
      const { error } = await anon.auth.signUp({
        email: `underage-${suffix}@example.test`,
        password,
        options: { data: { date_of_birth: "2020-01-01" } },
      });
      assert.ok(error);
    },
  );
  // Confirm a fixture via admin for API-isolation tests; browser tests separately
  // exercise real verification tokens and the application's confirmation route.
  await admin.auth.admin.updateUserById(aId, { email_confirm: true });
  const created = await admin.auth.admin.createUser({
    email: bEmail,
    password,
    email_confirm: true,
    user_metadata: { date_of_birth: "1990-01-01" },
  });
  assert.equal(created.error, null);
  bId = created.data.user.id;
  await check(
    "verified accounts obtain independent real sessions",
    async () => {
      assert.equal(
        (await a.auth.signInWithPassword({ email: aEmail, password })).error,
        null,
      );
      assert.equal(
        (await b.auth.signInWithPassword({ email: bEmail, password })).error,
        null,
      );
    },
  );
  await check(
    "session refresh returns a verified current identity",
    async () => {
      assert.equal((await a.auth.refreshSession()).error, null);
      assert.equal((await a.auth.getUser()).data.user.id, aId);
    },
  );
  await check(
    "PostgREST RLS isolates accounts and rejects anonymous enumeration",
    async () => {
      const self = await a.from("profiles").select("id");
      assert.deepEqual(self.data, [{ id: aId }]);
      assert.deepEqual(
        (await b.from("profiles").select("id").eq("id", aId)).data,
        [],
      );
      assert.ok((await anon.from("profiles").select("username")).error);
    },
  );
  const profile = {
    p_username: `api_${suffix}`,
    p_display_name: "API member",
    p_bio: "Private test",
    p_visibility: "private",
    p_interests: ["co-op"],
    p_games: ["minecraft"],
    p_platforms: ["pc"],
    p_complete: true,
  };
  await check(
    "profile RPC saves only the current user and enforces unique usernames",
    async () => {
      assert.equal((await a.rpc("save_my_profile", profile)).data, true);
      assert.equal((await b.rpc("save_my_profile", profile)).data, false);
      assert.equal(
        (await b.from("profiles").select("username").single()).data.username,
        null,
      );
    },
  );
  await check(
    "private profile cannot be looked up by another account or anonymously",
    async () => {
      assert.deepEqual(
        (await b.rpc("visible_profile", { p_username: profile.p_username }))
          .data,
        [],
      );
      assert.deepEqual(
        (await anon.rpc("visible_profile", { p_username: profile.p_username }))
          .data,
        [],
      );
    },
  );
  await check(
    "direct authenticated Storage writes are refused even in own folder",
    async () => {
      const { error } = await a.storage
        .from("avatars")
        .upload(`${aId}/${randomUUID()}.webp`, Buffer.from("fake"), {
          contentType: "image/webp",
        });
      assert.ok(error);
    },
  );
  await check("avatar pointers cannot reference another account", async () => {
    avatar = `${aId}/${randomUUID()}.webp`;
    const image = await sharp({
      create: { width: 16, height: 16, channels: 3, background: "#7350db" },
    })
      .webp()
      .toBuffer();
    assert.equal(
      (
        await admin.storage
          .from("avatars")
          .upload(avatar, image, { contentType: "image/webp" })
      ).error,
      null,
    );
    assert.equal(
      (await b.rpc("set_my_avatar", { p_path: avatar })).data,
      false,
    );
    assert.equal((await a.rpc("set_my_avatar", { p_path: avatar })).data, true);
    assert.equal((await b.rpc("visible_avatar", { p_id: aId })).data, null);
  });
  await check(
    "public visibility exposes only the explicit profile projection",
    async () => {
      assert.equal(
        (await a.rpc("save_my_profile", { ...profile, p_visibility: "public" }))
          .data,
        true,
      );
      const result = await anon.rpc("visible_profile", {
        p_username: profile.p_username,
      });
      assert.equal(result.error, null);
      assert.equal(result.data.length, 1);
      assert.equal("email" in result.data[0], false);
      assert.equal("date_of_birth" in result.data[0], false);
      assert.equal("interests" in result.data[0], false);
    },
  );
  await check(
    "deleted identities lose member-only API access even with an unexpired JWT",
    async () => {
      assert.equal(
        (
          await a.rpc("save_my_profile", {
            ...profile,
            p_visibility: "members",
          })
        ).data,
        true,
      );
      assert.equal(
        (await b.rpc("visible_profile", { p_username: profile.p_username }))
          .data.length,
        1,
      );
      assert.equal((await admin.auth.admin.deleteUser(bId)).error, null);
      bId = undefined;
      assert.deepEqual(
        (await b.rpc("visible_profile", { p_username: profile.p_username }))
          .data,
        [],
      );
    },
  );
  await check("sign-out revokes refresh sessions", async () => {
    assert.equal((await a.auth.signOut({ scope: "global" })).error, null);
    assert.equal((await a.auth.getSession()).data.session, null);
  });
  console.log(`${count} real Supabase API integration tests passed.`);
} finally {
  if (avatar) await admin.storage.from("avatars").remove([avatar]);
  for (const id of [aId, bId]) if (id) await admin.auth.admin.deleteUser(id);
}
