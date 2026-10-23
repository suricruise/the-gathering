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
  throw Error("Local services required");
const opts = {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
};
const make = () =>
  createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    opts,
  );
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
  clients = [],
  subscriptions = [];
let community;
let checks = 0;
const check = async (name, fn) => {
  await fn();
  console.log(`PASS ${name}`);
  checks++;
};
const rpc = async (c, name, args) => {
  const r = await c.rpc(name, args);
  assert.equal(r.error, null, `${name}: ${r.error?.code}`);
  return r.data;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(test) {
  for (let i = 0; i < 100; i++) {
    if (await test()) return;
    await sleep(100);
  }
  throw Error("Realtime assertion timed out");
}
async function subscribe(client, topic, events) {
  await client.realtime.setAuth(
    (await client.auth.getSession()).data.session.access_token,
  );
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(Error("Subscription timed out")),
      12000,
    );
    const channel = client
      .channel(topic, { config: { private: true } })
      .on("broadcast", { event: "changed" }, ({ payload }) =>
        events.push(payload),
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          clearTimeout(timer);
          subscriptions.push([client, channel]);
          resolve(channel);
        }
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          clearTimeout(timer);
          reject(Error("Subscription rejected"));
        }
      });
  });
}
try {
  for (let i = 0; i < 4; i++) {
    const email = `chat-${randomUUID()}@example.test`,
      password = `Test-${randomUUID()}`;
    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { date_of_birth: "1990-01-01" },
    });
    assert.equal(created.error, null);
    users.push(created.data.user.id);
    const c = make();
    assert.equal(
      (await c.auth.signInWithPassword({ email, password })).error,
      null,
    );
    clients.push(c);
  }
  const [a, b, outsider, mod] = clients;
  await db.query("insert into private.community_creators(user_id) values($1)", [
    users[0],
  ]);
  community = (
    await rpc(a, "community_command", {
      p_operation: "create",
      p_data: {
        slug: `chat-${randomUUID().slice(0, 8)}`,
        name: "Realtime integration",
        description: "Local tests",
        visibility: "public",
        cover: "nebula",
      },
    })
  ).id;
  for (const c of [b, mod])
    await rpc(c, "community_command", {
      p_operation: "join",
      p_community: community,
    });
  await rpc(a, "community_command", {
    p_operation: "role",
    p_community: community,
    p_data: { user_id: users[3], role: "moderator" },
  });
  const general = (
    await a
      .from("channels")
      .select("id")
      .eq("community_id", community)
      .eq("name", "general")
      .single()
  ).data.id;
  const topic = (await rpc(a, "chat_session", { p_channel: general })).topic;
  const events = [];
  const channel = await subscribe(b, topic, events);
  // A cold real self-hosted tenant can acknowledge a subscription before its
  // first WAL replication slot is ready. Require actual transport readiness.
  await until(
    async () =>
      (
        await db.query(
          "select exists(select 1 from pg_replication_slots where slot_name like 'supabase_realtime_messages_replication_slot_%' and active) as ready",
        )
      ).rows[0].ready,
  );
  let message = randomUUID();
  await check(
    "real private Broadcast delivers a committed persistent message ID",
    async () => {
      await rpc(a, "send_channel_message", {
        p_id: message,
        p_channel: general,
        p_body: "A real committed message",
      });
      await until(() => events.some((e) => e.id === message));
      assert.deepEqual(Object.keys(events.find((e) => e.id === message)), [
        "id",
      ]);
      assert.equal(
        (await rpc(b, "chat_message", { p_id: message })).body,
        "A real committed message",
      );
    },
  );
  await check(
    "retry and simultaneous retry use one stable persisted ID",
    async () => {
      await rpc(a, "send_channel_message", {
        p_id: message,
        p_channel: general,
        p_body: "A real committed message",
      });
      const id = randomUUID();
      await Promise.all([
        rpc(a, "send_channel_message", {
          p_id: id,
          p_channel: general,
          p_body: "Concurrent retry",
        }),
        rpc(a, "send_channel_message", {
          p_id: id,
          p_channel: general,
          p_body: "Concurrent retry",
        }),
      ]);
      assert.equal(
        (await a.from("messages").select("id").eq("id", id)).data.length,
        1,
      );
    },
  );
  await check(
    "readers cannot deliver forged client Broadcast message events",
    async () => {
      const observed = [];
      await subscribe(a, topic, observed);
      const forged = randomUUID();
      await channel.send({
        type: "broadcast",
        event: "changed",
        payload: { id: forged },
      });
      await sleep(600);
      assert.ok(!observed.some((event) => event.id === forged));
    },
  );
  await check(
    "unauthorized subscription attempts are rejected by real Realtime",
    async () => {
      await assert.rejects(() => subscribe(outsider, topic, []), /rejected/);
      await outsider.removeAllChannels();
    },
  );
  await check(
    "unauthorized history, edits, deletes, and send calls fail",
    async () => {
      for (const [name, args] of [
        ["chat_page", { p_channel: general }],
        [
          "send_channel_message",
          { p_id: randomUUID(), p_channel: general, p_body: "forbidden" },
        ],
        [
          "change_channel_message",
          { p_id: message, p_operation: "edit", p_body: "forged" },
        ],
        ["change_channel_message", { p_id: message, p_operation: "delete" }],
      ])
        assert.ok((await outsider.rpc(name, args)).error);
      assert.equal(
        (await outsider.from("messages").select("id").eq("channel_id", general))
          .data.length,
        0,
      );
      assert.ok(
        (
          await b.rpc("change_channel_message", {
            p_id: message,
            p_operation: "edit",
            p_body: "forged",
          })
        ).error,
      );
      assert.ok(
        (
          await b.rpc("change_channel_message", {
            p_id: message,
            p_operation: "delete",
          })
        ).error,
      );
    },
  );
  await check(
    "own edits, reactions, threaded replies, and moderator deletion persist",
    async () => {
      await rpc(a, "change_channel_message", {
        p_id: message,
        p_operation: "edit",
        p_body: "Edited committed message",
      });
      await rpc(b, "set_message_reaction", {
        p_message: message,
        p_emoji: "👍",
        p_active: true,
      });
      await rpc(b, "set_message_reaction", {
        p_message: message,
        p_emoji: "👍",
        p_active: true,
      });
      const reply = randomUUID();
      await rpc(b, "send_channel_message", {
        p_id: reply,
        p_channel: general,
        p_body: "A threaded reply",
        p_parent: message,
        p_reply_to: message,
      });
      assert.equal(
        (await rpc(b, "chat_page", { p_channel: general, p_parent: message }))
          .messages.length,
        1,
      );
      assert.equal(
        (await rpc(b, "chat_message", { p_id: message })).reactions[0].count,
        1,
      );
      await rpc(mod, "change_channel_message", {
        p_id: message,
        p_operation: "delete",
        p_reason: "Integration moderation",
      });
      assert.equal((await rpc(b, "chat_message", { p_id: message })).body, "");
    },
  );
  await check(
    "transaction rollback emits no committed Broadcast event",
    async () => {
      const id = randomUUID();
      await db.query("begin");
      await db.query(
        "insert into public.messages(id,channel_id,author_id,body) values($1,$2,$3,$4)",
        [id, general, users[0], "Rolled back"],
      );
      await sleep(200);
      assert.ok(!events.some((e) => e.id === id));
      await db.query("rollback");
      await sleep(200);
      assert.ok(!events.some((e) => e.id === id));
    },
  );
  await check(
    "reconnection catches up missed rows without duplicate IDs",
    async () => {
      const page = await rpc(b, "chat_page", { p_channel: general });
      await b.removeChannel(channel);
      const id = randomUUID();
      await rpc(a, "send_channel_message", {
        p_id: id,
        p_channel: general,
        p_body: "During a disconnect",
      });
      const restored = [];
      await subscribe(b, topic, restored);
      const changes = await rpc(b, "chat_changes", {
        p_channel: general,
        p_after: page.watermark,
      });
      assert.equal(changes.filter((m) => m.id === id).length, 1);
      const merged = new Map(
        [...page.messages, ...changes, ...changes].map((m) => [m.id, m]),
      );
      assert.equal([...merged.values()].filter((m) => m.id === id).length, 1);
    },
  );
  await check(
    "read watermarks advance monotonically and unread counts clear",
    async () => {
      const page = await rpc(b, "chat_page", { p_channel: general });
      const last = page.messages.at(-1);
      await rpc(b, "mark_channel_read", {
        p_channel: general,
        p_message: last.id,
      });
      await rpc(b, "mark_channel_read", {
        p_channel: general,
        p_message: page.messages[0].id,
      });
      assert.equal(
        (await rpc(b, "chat_page", { p_channel: general })).unread_count,
        0,
      );
    },
  );
  await check(
    "membership revocation rotates topics and rejects the stale topic",
    async () => {
      await rpc(a, "community_command", {
        p_operation: "ban",
        p_community: community,
        p_data: { user_id: users[1] },
      });
      assert.ok((await b.rpc("chat_session", { p_channel: general })).error);
      await b.removeAllChannels();
      const freshB = make();
      clients.push(freshB);
      await freshB.auth.setSession((await b.auth.getSession()).data.session);
      await assert.rejects(() => subscribe(freshB, topic, []), /rejected/);
      const newTopic = (await rpc(a, "chat_session", { p_channel: general }))
        .topic;
      assert.notEqual(newTopic, topic);
      const freshA = make();
      clients.push(freshA);
      await freshA.auth.setSession((await a.auth.getSession()).data.session);
      await assert.rejects(() => subscribe(freshA, topic, []), /rejected/);
    },
  );
  console.log(`${checks} real Realtime/API messaging checks passed.`);
} finally {
  await db.query("rollback");
  for (const c of clients) {
    await c.removeAllChannels();
    c.realtime.disconnect();
  }
  if (community)
    await db.query("delete from public.communities where id=$1", [community]);
  for (const id of users) await admin.auth.admin.deleteUser(id);
  await db.end();
}
