import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import pg from "pg";
import { createClient } from "@supabase/supabase-js";
const env = parseEnv(readFileSync(".env.local", "utf8"));
if (
  !["localhost", "127.0.0.1"].includes(
    new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname,
  )
)
  throw Error("Local only");
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SECRET_KEY,
  opts,
);
const db = new pg.Client({
  connectionString: readFileSync(".local-stack/database-url", "utf8").trim(),
});
await db.connect();
const users = [],
  clients = [];
let community;
let checks = 0;
const rpc = async (c, n, args = {}) => {
  const r = await c.rpc(n, args);
  assert.equal(r.error, null, `${n}: ${r.error?.code}`);
  return r.data;
};
const cmd = (c, operation, data) =>
  rpc(c, "space_command", { p_operation: operation, p_data: data });
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn) => {
  for (let i = 0; i < 100; i++) {
    if (await fn()) return;
    await pause(100);
  }
  throw Error("Live notification timed out");
};
const check = async (name, fn) => {
  await fn();
  checks++;
  console.log("PASS " + name);
};
async function sub(c, topic, events) {
  await c.realtime.setAuth(
    (await c.auth.getSession()).data.session.access_token,
  );
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(Error("Subscription timed out")),
      12000,
    );
    const ch = c
      .channel(topic, { config: { private: true } })
      .on("broadcast", { event: "changed" }, ({ payload }) =>
        events.push(payload),
      )
      .subscribe((s) => {
        if (s === "SUBSCRIBED") {
          clearTimeout(timer);
          resolve(ch);
        } else if (s === "CHANNEL_ERROR" || s === "TIMED_OUT") {
          clearTimeout(timer);
          void c.removeChannel(ch);
          reject(Error("Subscription rejected"));
        }
      });
  });
}
const prefs = {
  friend_requests: true,
  replies: true,
  mentions: false,
  community_invitations: false,
  event_reminders: false,
  event_updates: true,
  gaming_invitations: false,
  moderator_notices: true,
  daily_content: false,
};
try {
  for (let i = 0; i < 3; i++) {
    const email = `space-live-${randomUUID()}@example.test`,
      password = `Test-${randomUUID()}`;
    const r = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { date_of_birth: "1990-01-01" },
    });
    assert.equal(r.error, null);
    users.push(r.data.user.id);
    const c = createClient(
      env.NEXT_PUBLIC_SUPABASE_URL,
      env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      opts,
    );
    clients.push(c);
    assert.equal(
      (await c.auth.signInWithPassword({ email, password })).error,
      null,
    );
    await rpc(c, "save_my_profile", {
      p_username: "live_" + r.data.user.id.slice(0, 8),
      p_display_name: "Live notification fixture",
      p_bio: "Local only",
      p_visibility: "members",
      p_interests: ["faith"],
      p_games: ["minecraft"],
      p_platforms: ["pc"],
      p_complete: true,
    });
  }
  const [a, b, m] = clients;
  const [aid, bid, mid] = users;
  community = randomUUID();
  await db.query(
    "insert into public.communities(id,slug,name,visibility) values($1,$2,'Private prayer live test','private')",
    [community, "live-" + community.slice(0, 8)],
  );
  await db.query(
    "insert into public.community_members(community_id,user_id,role_id) values($1,$2,'member'),($1,$3,'member'),($1,$4,'owner')",
    [community, aid, bid, mid],
  );
  const events = [];
  await sub(a, "people:" + aid, events);
  await check(
    "unrelated authenticated members cannot subscribe to another notification topic",
    async () => {
      await assert.rejects(() => sub(b, "people:" + aid, []), /rejected/);
    },
  );
  const secret = "Confidential prayer body " + randomUUID();
  const p = (
    await cmd(a, "prayer-create", {
      id: randomUUID(),
      community,
      body: secret,
      visibility: "moderators",
      guidelines: true,
    })
  ).id;
  await check(
    "notifications broadcast only generic invalidations after commit, with no private contents",
    async () => {
      await db.query("begin");
      await db.query(
        "insert into public.prayer_comments(id,prayer_id,author_id,body) values($1,$2,$3,$4)",
        [randomUUID(), p, mid, "Private encouragement " + secret],
      );
      await pause(250);
      assert.equal(events.length, 0);
      await db.query("commit");
      await until(() => events.length > 0);
      assert.deepEqual(Object.keys(events[0]), ["id"]);
      const n = await rpc(a, "space_read", { p_view: "notifications" });
      assert.equal(n.items.length, 1);
      assert.doesNotMatch(JSON.stringify(n), /Confidential|encouragement/);
      assert.equal(
        (await b.rpc("space_read", { p_view: "prayer", p_resource: p })).error
          ?.code,
        "42501",
      );
    },
  );
  await check(
    "rolled-back replies produce neither persistent notices nor live delivery",
    async () => {
      const old = events.length;
      await db.query("begin");
      await db.query(
        "insert into public.prayer_comments(id,prayer_id,author_id,body) values($1,$2,$3,$4)",
        [randomUUID(), p, mid, "Never commit"],
      );
      await db.query("rollback");
      await pause(250);
      assert.equal(events.length, old);
      assert.equal(
        (await rpc(a, "space_read", { p_view: "notifications" })).items.length,
        1,
      );
    },
  );
  await check(
    "notification opt-outs prevent new private reply delivery and hide old notices",
    async () => {
      await cmd(a, "preferences", { ...prefs, replies: false });
      await cmd(m, "prayer-comment", {
        id: randomUUID(),
        prayer: p,
        body: "A reply after opting out",
      });
      assert.equal(
        (await rpc(a, "space_read", { p_view: "notifications" })).items.length,
        0,
      );
    },
  );
  await check(
    "service-only reminder delivery requires consent and remains deduplicated",
    async () => {
      const event = (
        await cmd(a, "event-create", {
          id: randomUUID(),
          community,
          title: "Private live reminder fixture",
          description: "Private event details",
          kind: "discussion",
          banner: "ocean",
          starts_local: new Date(Date.now() + 1800000)
            .toISOString()
            .slice(0, 16),
          ends_local: new Date(Date.now() + 5400000).toISOString().slice(0, 16),
          time_zone: "UTC",
          session: null,
          voice: null,
        })
      ).id;
      await cmd(b, "rsvp", { id: event, response: "going" });
      assert.equal((await rpc(admin, "deliver_event_reminders")).delivered, 0);
      await cmd(b, "preferences", { ...prefs, event_reminders: true });
      const received = [];
      await sub(b, "people:" + bid, received);
      assert.equal((await rpc(admin, "deliver_event_reminders")).delivered, 1);
      await until(() => received.length > 0);
      assert.equal((await rpc(admin, "deliver_event_reminders")).delivered, 0);
      assert.equal(
        (await a.rpc("deliver_event_reminders")).error?.code,
        "42501",
      );
      const n = await rpc(b, "space_read", { p_view: "notifications" });
      assert.ok(n.items.some((n) => n.kind === "event_reminders"));
      assert.doesNotMatch(
        JSON.stringify(n),
        /Private event details|live reminder fixture/,
      );
      assert.equal(
        (await db.query("select * from private.notification_delivery_outbox"))
          .rowCount,
        0,
      );
    },
  );
  await check(
    "a mutual block revokes private moderator replies despite a valid session",
    async () => {
      await db.query(
        "insert into public.member_blocks(blocker_id,blocked_id,label) values($1,$2,'Blocked moderator')",
        [aid, mid],
      );
      assert.equal(
        (await m.rpc("space_read", { p_view: "prayer", p_resource: p })).error
          ?.code,
        "42501",
      );
      assert.equal(
        (
          await m.rpc("space_command", {
            p_operation: "prayer-comment",
            p_data: { id: randomUUID(), prayer: p, body: "Must be denied" },
          })
        ).error?.code,
        "42501",
      );
    },
  );
  console.log(`${checks} real Phase 10 API/Realtime checks passed.`);
} finally {
  await db.query("rollback").catch(() => {});
  for (const c of clients) {
    await c.removeAllChannels();
    c.realtime.disconnect();
  }
  if (community)
    await db.query("delete from public.communities where id=$1", [community]);
  for (const id of users) await admin.auth.admin.deleteUser(id);
  await db.end();
}
