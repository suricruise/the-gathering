import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import pg from "pg";
import { createClient } from "@supabase/supabase-js";
const env = parseEnv(readFileSync(".env.local", "utf8"));
if (
  !["127.0.0.1", "localhost"].includes(
    new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname,
  )
)
  throw Error("Local only");
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SECRET_KEY,
  options,
);
const clients = [],
  users = [],
  channels = [];
const db = new pg.Client({
  connectionString: readFileSync(".local-stack/database-url", "utf8").trim(),
});
await db.connect();
let checks = 0;
async function rpc(c, name, args = {}) {
  const r = await c.rpc(name, args);
  assert.equal(r.error, null, `${name}: ${r.error?.code}`);
  assert.ok(!r.data?.limited, "Unexpected limit");
  return r.data;
}
const cmd = (c, operation, data = {}) =>
  rpc(c, "people_command", { p_operation: operation, p_data: data });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn) {
  for (let i = 0; i < 100; i++) {
    if (await fn()) return;
    await wait(100);
  }
  throw Error("Realtime delivery timed out");
}
async function check(name, fn) {
  await fn();
  checks++;
  console.log("PASS " + name);
}
async function subscribe(c, topic, events) {
  await c.realtime.setAuth(
    (await c.auth.getSession()).data.session.access_token,
  );
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(Error("Subscription timed out")),
      12000,
    );
    const channel = c
      .channel(topic, { config: { private: true } })
      .on("broadcast", { event: "changed" }, ({ payload }) =>
        events.push(payload),
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          clearTimeout(timer);
          channels.push([c, channel]);
          resolve(channel);
        }
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          clearTimeout(timer);
          void c.removeChannel(channel);
          reject(Error("Subscription rejected"));
        }
      });
  });
}
try {
  for (let i = 0; i < 3; i++) {
    const email = `people-api-${randomUUID()}@example.test`,
      password = `Test-${randomUUID()}`;
    const r = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { date_of_birth: "1990-01-01" },
    });
    assert.equal(r.error, null);
    const id = r.data.user.id;
    users.push(id);
    const c = createClient(
      env.NEXT_PUBLIC_SUPABASE_URL,
      env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      options,
    );
    clients.push(c);
    assert.equal(
      (await c.auth.signInWithPassword({ email, password })).error,
      null,
    );
    await rpc(c, "save_my_profile", {
      p_username: "person_" + id.slice(0, 8),
      p_display_name: "Realtime person",
      p_bio: "Local fixture",
      p_visibility: "members",
      p_interests: ["co-op"],
      p_games: ["minecraft"],
      p_platforms: ["pc"],
      p_complete: true,
    });
    await cmd(c, "privacy", {
      discoverable: true,
      allow_requests: true,
      dm_policy: "friends",
      share_presence: false,
    });
  }
  const [a, b, c] = clients,
    [aid, bid, cid] = users;
  await cmd(a, "request", { target: bid });
  await cmd(b, "accept", { target: aid });
  const con = (await cmd(a, "open", { target: bid })).id;
  await check(
    "unauthorized private conversation and member notification subscriptions are rejected",
    async () => {
      await assert.rejects(() => subscribe(c, "dm:" + con, []), /rejected/);
      await assert.rejects(() => subscribe(c, "people:" + bid, []), /rejected/);
    },
  );
  const events = [],
    notifications = [];
  let subscription = await subscribe(b, "dm:" + con, events);
  await subscribe(b, "people:" + bid, notifications);
  await until(
    async () =>
      (
        await db.query(
          "select exists(select 1 from pg_replication_slots where slot_name like 'supabase_realtime_messages_replication_slot_%' and active) ready",
        )
      ).rows[0].ready,
  );
  const id = randomUUID();
  await check(
    "private Broadcast delivers committed message ID; no message body or history is broadcast",
    async () => {
      await cmd(a, "send", {
        conversation: con,
        id,
        body: "Actual private transport",
      });
      await until(() => events.some((e) => e.id === id));
      assert.deepEqual(Object.keys(events.find((e) => e.id === id)), ["id"]);
      assert.equal(
        (await rpc(b, "dm_history", { p_conversation: con })).items[0].body,
        "Actual private transport",
      );
      await until(() => notifications.length > 0);
      assert.deepEqual(Object.keys(notifications[0]), ["id"]);
    },
  );
  await check(
    "reconnection and retry reconcile by stable ID without duplicate messages",
    async () => {
      await b.removeChannel(subscription);
      subscription = await subscribe(b, "dm:" + con, events);
      await cmd(a, "send", {
        conversation: con,
        id,
        body: "Actual private transport",
      });
      assert.equal(
        (await rpc(b, "dm_history", { p_conversation: con })).items.length,
        1,
      );
      const next = randomUUID();
      await cmd(a, "send", {
        conversation: con,
        id: next,
        body: "After reconnect",
      });
      await until(() => events.some((e) => e.id === next));
      assert.equal(events.filter((e) => e.id === next).length, 1);
    },
  );
  await check(
    "concurrent stable retries create exactly one persisted message",
    async () => {
      const next = randomUUID();
      await Promise.all(
        Array.from({ length: 6 }, () =>
          cmd(a, "send", {
            conversation: con,
            id: next,
            body: "Racing retries",
          }),
        ),
      );
      assert.equal(
        (
          await db.query(
            "select count(*)::int n from public.direct_messages where id=$1",
            [next],
          )
        ).rows[0].n,
        1,
      );
    },
  );
  await check(
    "concurrent conversation open shares a normalized unique pair",
    async () => {
      const all = await Promise.all([
        cmd(a, "open", { target: bid }),
        cmd(b, "open", { target: aid }),
      ]);
      assert.ok(all.every((r) => r.id === con));
    },
  );
  await check(
    "block serializes with concurrent send; afterwards both directions lose access",
    async () => {
      const out = await Promise.all([
        a.rpc("people_command", {
          p_operation: "send",
          p_data: { conversation: con, id: randomUUID(), body: "Racing block" },
        }),
        b.rpc("people_command", {
          p_operation: "block",
          p_data: { target: aid },
        }),
      ]);
      assert.equal(out[1].error, null);
      assert.ok(!out[0].error || out[0].error.code === "42501");
      for (const x of [a, b]) {
        assert.equal(
          (await x.rpc("dm_history", { p_conversation: con })).error?.code,
          "42501",
        );
        assert.equal(
          (await x.rpc("people_topic_allowed", { p_topic: "dm:" + con })).data,
          false,
        );
      }
      await assert.rejects(() => subscribe(a, "dm:" + con, []), /rejected/);
    },
  );
  await check(
    "crossing concurrent requests create one pending pair; block versus acceptance cannot restore it",
    async () => {
      await Promise.all([
        cmd(a, "request", { target: cid }),
        cmd(c, "request", { target: aid }),
      ]);
      const pairs = (
        await db.query(
          "select * from public.friendships where low_id=least($1::uuid,$2::uuid) and high_id=greatest($1::uuid,$2::uuid)",
          [aid, cid],
        )
      ).rows;
      assert.equal(pairs.length, 1);
      assert.equal(pairs[0].status, "pending");
      const sender = pairs[0].requested_by === aid ? a : c,
        recipient = sender === a ? c : a,
        recipientId = sender === a ? cid : aid,
        senderId = sender === a ? aid : cid;
      const raced = await Promise.all([
        recipient.rpc("people_command", {
          p_operation: "accept",
          p_data: { target: senderId },
        }),
        sender.rpc("people_command", {
          p_operation: "block",
          p_data: { target: recipientId },
        }),
      ]);
      assert.equal(raced[1].error, null);
      assert.ok(!raced[0].error || raced[0].error.code === "42501");
      assert.equal(
        (
          await db.query(
            "select * from public.friendships where low_id=least($1::uuid,$2::uuid) and high_id=greatest($1::uuid,$2::uuid)",
            [aid, cid],
          )
        ).rowCount,
        0,
      );
    },
  );
  await check(
    "request spam quota is shared across direct API clients and cannot spoof user identity",
    async () => {
      await db.query("delete from private.people_budgets where user_id=$1", [
        cid,
      ]);
      for (let i = 0; i < 10; i++)
        assert.equal(
          await rpc(c, "people_budget", { p_operation: "request" }),
          true,
        );
      assert.equal(
        await rpc(c, "people_budget", { p_operation: "request" }),
        false,
      );
      assert.equal(
        (
          await c.rpc("people_command", {
            p_operation: "request",
            p_data: { target: bid },
          })
        ).data.limited,
        true,
      );
      assert.equal(
        (
          await c.from("direct_messages").insert({
            id: randomUUID(),
            conversation_id: con,
            sender_id: aid,
            body: "Spoof",
          })
        ).error?.code,
        "42501",
      );
    },
  );
  console.log(`${checks} real Realtime/API/concurrency checks passed.`);
} finally {
  for (const [c, ch] of channels) await c.removeChannel(ch);
  for (const c of clients) {
    await c.removeAllChannels();
    c.realtime.disconnect();
  }
  for (const id of users) await admin.auth.admin.deleteUser(id);
  await db.end();
}
