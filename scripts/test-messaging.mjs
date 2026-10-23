import pg from "pg";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
const connectionString = readFileSync(
  ".local-stack/database-url",
  "utf8",
).trim();
if (!["localhost", "127.0.0.1"].includes(new URL(connectionString).hostname))
  throw Error("Local only");
const db = new pg.Client({ connectionString });
await db.connect();
const [a, b, c] = [randomUUID(), randomUUID(), randomUUID()];
let checks = 0;
async function role(id) {
  await db.query("reset role");
  await db.query(id ? "set local role authenticated" : "set local role anon");
  await db.query(
    "select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)",
    [
      id ?? "",
      JSON.stringify({
        sub: id ?? undefined,
        role: id ? "authenticated" : "anon",
      }),
    ],
  );
}
async function admin() {
  await db.query("reset role");
}
async function rpc(id, name, args) {
  await role(id);
  const keys = Object.keys(args);
  return (
    await db.query(
      `select public.${name}(${keys.map((k, i) => `${k}=>$${i + 1}`).join(",")}) as value`,
      Object.values(args),
    )
  ).rows[0].value;
}
async function denied(fn, code = "42501") {
  await db.query("savepoint denied");
  let caught = false;
  try {
    await fn();
  } catch (e) {
    caught = true;
    assert.equal(e.code, code);
  } finally {
    await db.query("rollback to savepoint denied");
    await db.query("release savepoint denied");
  }
  assert.ok(caught, "Expected permission/input denial");
}
async function check(name, fn) {
  await fn();
  console.log(`PASS ${name}`);
  checks++;
}
try {
  await db.query("begin");
  for (const id of [a, b, c])
    await db.query(
      'insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values($1,$2,now(),\'{"date_of_birth":"1990-01-01"}\')',
      [id, `${id}@example.test`],
    );
  await db.query("insert into private.community_creators(user_id) values($1)", [
    a,
  ]);
  const community = (
    await rpc(a, "community_command", {
      p_operation: "create",
      p_data: {
        slug: `dbchat-${randomUUID().slice(0, 8)}`,
        name: "Database chat",
        description: "Test",
        visibility: "public",
        cover: "nebula",
      },
    })
  ).id;
  await rpc(b, "community_command", {
    p_operation: "join",
    p_community: community,
  });
  await role(a);
  const channel = (
    await db.query("select id from public.channels where community_id=$1", [
      community,
    ])
  ).rows[0].id;
  const send = (user, id, body, extra = {}) =>
    rpc(user, "send_channel_message", {
      p_id: id,
      p_channel: channel,
      p_body: body,
      ...extra,
    });
  const msg = randomUUID();
  await check(
    "verified active member persists an authoritative message",
    async () => {
      assert.equal(await send(a, msg, "First message"), msg);
      const m = await rpc(b, "chat_message", { p_id: msg });
      assert.equal(m.author_id, a);
      assert.equal(m.body, "First message");
      assert.ok(m.version && m.created_seq);
    },
  );
  await check(
    "retry is idempotent even if text changed after a lost response",
    async () => {
      await send(a, msg, "different retry body");
      assert.equal(
        (await rpc(a, "chat_message", { p_id: msg })).body,
        "First message",
      );
    },
  );
  await check("another author cannot reuse a stable message ID", () =>
    denied(() => send(b, msg, "forged")),
  );
  await check(
    "raw message/reaction/receipt writes and private moderation reads are denied",
    async () => {
      await role(b);
      for (const sql of [
        "update public.messages set body='forged'",
        "delete from public.messages",
        "insert into public.read_receipts(channel_id,user_id) values($1,$2)",
        "select * from private.message_moderation",
      ]) {
        await denied(() =>
          db.query(sql, sql.includes("$1") ? [channel, b] : []),
        );
      }
    },
  );
  await check(
    "nonmembers cannot read, search, edit, delete or send",
    async () => {
      await role(c);
      assert.equal(
        (
          await db.query("select * from public.messages where channel_id=$1", [
            channel,
          ])
        ).rowCount,
        0,
      );
      assert.equal(await rpc(c, "chat_message", { p_id: msg }), null);
      await denied(() =>
        rpc(c, "chat_page", { p_channel: channel, p_search: "First" }),
      );
      await denied(() => send(c, randomUUID(), "forged"));
      await denied(() =>
        rpc(c, "change_channel_message", { p_id: msg, p_operation: "delete" }),
      );
    },
  );
  await check(
    "ordinary members cannot edit or delete another member message",
    async () => {
      await denied(() =>
        rpc(b, "change_channel_message", {
          p_id: msg,
          p_operation: "edit",
          p_body: "forged",
        }),
      );
      await denied(() =>
        rpc(b, "change_channel_message", { p_id: msg, p_operation: "delete" }),
      );
    },
  );
  await check("own edits advance revisions and preserve IDs", async () => {
    const before = await rpc(a, "chat_message", { p_id: msg });
    await rpc(a, "change_channel_message", {
      p_id: msg,
      p_operation: "edit",
      p_body: "Edited message",
    });
    const after = await rpc(b, "chat_message", { p_id: msg });
    assert.equal(after.id, msg);
    assert.ok(BigInt(after.version) > BigInt(before.version));
    assert.ok(after.edited_at);
  });
  await check(
    "reactions are bounded, own-scoped and retry-idempotent",
    async () => {
      for (let i = 0; i < 2; i++)
        await rpc(b, "set_message_reaction", {
          p_message: msg,
          p_emoji: "👍",
          p_active: true,
        });
      assert.equal(
        (await rpc(a, "chat_message", { p_id: msg })).reactions[0].count,
        1,
      );
      await denied(
        () =>
          rpc(b, "set_message_reaction", {
            p_message: msg,
            p_emoji: "invalid",
            p_active: true,
          }),
        "22023",
      );
      await rpc(b, "set_message_reaction", {
        p_message: msg,
        p_emoji: "👍",
        p_active: false,
      });
      assert.equal(
        (await rpc(a, "chat_message", { p_id: msg })).reactions.length,
        0,
      );
    },
  );
  const reply = randomUUID();
  await check("thread replies preserve the root and reply target", async () => {
    await send(b, reply, "Thread reply", { p_parent: msg, p_reply_to: msg });
    const m = await rpc(a, "chat_message", { p_id: reply });
    assert.equal(m.parent_id, msg);
    assert.equal(m.reply_to_id, msg);
    assert.equal(
      (await rpc(a, "chat_page", { p_channel: channel, p_parent: msg }))
        .messages[0].id,
      reply,
    );
    assert.equal((await rpc(a, "chat_message", { p_id: msg })).reply_count, 1);
  });
  await check(
    "nested roots and nonexistent reply targets are rejected",
    async () => {
      await denied(() =>
        send(b, randomUUID(), "wrong root", { p_parent: reply }),
      );
      await denied(() =>
        send(b, randomUUID(), "wrong target", {
          p_parent: msg,
          p_reply_to: randomUUID(),
        }),
      );
    },
  );
  await check(
    "invalid bodies and forged staged files roll back atomically",
    async () => {
      await denied(() => send(a, randomUUID(), " "), "22023");
      await denied(() => send(a, randomUUID(), "x".repeat(4001)), "22023");
      const id = randomUUID();
      await denied(() =>
        send(a, id, "Forged file", { p_attachments: [randomUUID()] }),
      );
      assert.equal(await rpc(a, "chat_message", { p_id: id }), null);
    },
  );
  await check(
    "duplicate-content and per-user send budgets are enforced",
    async () => {
      await send(a, randomUUID(), "Duplicate content test");
      await denied(
        () => send(a, randomUUID(), "Duplicate content test"),
        "P0001",
      );
      await admin();
      await db.query(
        "insert into private.rate_limits(key,attempts) values($1,20) on conflict(key) do update set attempts=20,window_start=now()",
        [`chat-send:${b}`],
      );
      await denied(() => send(b, randomUUID(), "Over budget"), "P0001");
      await admin();
      await db.query("delete from private.rate_limits where key=$1", [
        `chat-send:${b}`,
      ]);
    },
  );
  await check(
    "pagination uses non-overlapping indexed server sequences",
    async () => {
      await admin();
      for (let n = 0; n < 45; n++)
        await db.query(
          "insert into public.messages(id,channel_id,author_id,body) values($1,$2,$3,$4)",
          [randomUUID(), channel, a, `Pagination unique ${n}`],
        );
      const newest = await rpc(b, "chat_page", { p_channel: channel });
      const older = await rpc(b, "chat_page", {
        p_channel: channel,
        p_before: newest.messages[0].created_seq,
      });
      assert.equal(newest.messages.length, 40);
      assert.ok(older.messages.length > 0);
      assert.ok(
        !older.messages.some((m) => newest.messages.some((n) => n.id === m.id)),
      );
    },
  );
  await check(
    "search returns only accessible matching channel messages",
    async () => {
      const result = await rpc(b, "chat_page", {
        p_channel: channel,
        p_search: "Pagination unique",
      });
      assert.equal(result.messages.length, 40);
      assert.ok(result.messages.every((m) => m.channel_id === channel));
      await denied(
        () => rpc(b, "chat_page", { p_channel: channel, p_search: "x" }),
        "22023",
      );
    },
  );
  await check(
    "read receipts are own-private, monotonic, with aggregate read counts",
    async () => {
      const p = await rpc(b, "chat_page", { p_channel: channel });
      const latest = p.messages.at(-1);
      await rpc(b, "mark_channel_read", {
        p_channel: channel,
        p_message: latest.id,
      });
      await rpc(b, "mark_channel_read", { p_channel: channel, p_message: msg });
      assert.equal(
        (await rpc(b, "chat_page", { p_channel: channel })).unread_count,
        0,
      );
      await role(a);
      assert.equal(
        (
          await db.query(
            "select * from public.read_receipts where user_id=$1",
            [b],
          )
        ).rowCount,
        0,
      );
      assert.equal(
        (await rpc(a, "chat_message", { p_id: latest.id })).read_count,
        1,
      );
    },
  );
  await check(
    "private-channel grants and post denials apply to persistence and topics",
    async () => {
      await rpc(a, "community_command", {
        p_operation: "channel",
        p_community: community,
        p_data: {
          id: channel,
          name: "general",
          description: "",
          kind: "text",
          is_private: true,
          position: 0,
        },
      });
      await denied(() => rpc(b, "chat_page", { p_channel: channel }));
      await rpc(a, "community_command", {
        p_operation: "override",
        p_community: community,
        p_data: {
          channel_id: channel,
          user_id: b,
          can_view: true,
          can_post: false,
          can_connect: false,
        },
      });
      assert.ok(
        (await rpc(b, "chat_page", { p_channel: channel })).messages.length,
      );
      await denied(() => send(b, randomUUID(), "Read only"));
      assert.equal(
        (await rpc(b, "chat_session", { p_channel: channel })).can_post,
        false,
      );
    },
  );
  await check(
    "topic authorization rejects malformed, stale, and cross-channel topics",
    async () => {
      const { topic } = await rpc(a, "chat_session", { p_channel: channel });
      assert.equal(
        await rpc(b, "chat_topic_allowed", { p_topic: topic }),
        true,
      );
      assert.equal(
        await rpc(c, "chat_topic_allowed", { p_topic: topic }),
        false,
      );
      assert.equal(
        await rpc(a, "chat_topic_allowed", { p_topic: "chat:bad:topic" }),
        false,
      );
      await rpc(a, "community_command", {
        p_operation: "ban",
        p_community: community,
        p_data: { user_id: b },
      });
      assert.equal(
        await rpc(b, "chat_topic_allowed", { p_topic: topic }),
        false,
      );
      assert.equal(
        await rpc(a, "chat_topic_allowed", { p_topic: topic }),
        false,
      );
    },
  );
  await check(
    "moderator deletion clears content and records immutable metadata",
    async () => {
      await rpc(a, "change_channel_message", {
        p_id: msg,
        p_operation: "delete",
        p_reason: "Rule enforcement",
      });
      assert.equal((await rpc(a, "chat_message", { p_id: msg })).body, "");
      await admin();
      assert.equal(
        (
          await db.query(
            "select reason from private.message_moderation where message_id=$1",
            [msg],
          )
        ).rows[0].reason,
        "Rule enforcement",
      );
      await denied(() =>
        rpc(a, "change_channel_message", {
          p_id: msg,
          p_operation: "edit",
          p_body: "resurrected",
        }),
      );
    },
  );
  await check(
    "attachment storage remains private even with broad permissive policies",
    async () => {
      await admin();
      await db.query(
        "create policy chat_test_broad on storage.objects for all to authenticated using(true) with check(true)",
      );
      await role(a);
      await denied(() =>
        db.query(
          "insert into storage.objects(bucket_id,name) values('message-files','forged')",
        ),
      );
      await denied(() =>
        db.query("select storage_path from public.message_attachments"),
      );
      await denied(() =>
        db.query("select public.chat_cleanup_files(null,500)"),
      );
    },
  );
  await check(
    "ordinary callers cannot store forged server-generated previews",
    async () => {
      await role(a);
      await denied(() =>
        db.query(
          "select public.store_message_preview($1,'https://example.com','forged','','example.com')",
          [reply],
        ),
      );
    },
  );
  await check(
    "staged file isolation and cleanup claims prevent expired-file sends",
    async () => {
      await admin();
      const fid = randomUUID();
      const path = `${channel}/${a}/${fid}`;
      await db.query(
        "insert into storage.objects(bucket_id,name) values('message-files',$1)",
        [path],
      );
      await db.query(
        "insert into public.message_attachments(id,channel_id,author_id,storage_path,filename,mime,kind,byte_size,created_at) values($1,$2,$3,$4,'test.txt','text/plain','file',4,now()-interval '25 hours')",
        [fid, channel, a, path],
      );
      await role(a);
      assert.equal(
        (
          await db.query(
            "select id from public.message_attachments where id=$1",
            [fid],
          )
        ).rowCount,
        1,
      );
      await role(c);
      assert.equal(
        (
          await db.query(
            "select id from public.message_attachments where id=$1",
            [fid],
          )
        ).rowCount,
        0,
      );
      await admin();
      await db.query("set local role service_role");
      const files = await db.query(
        "select * from public.chat_cleanup_files(null,500)",
      );
      assert.ok(files.rows.some((f) => f.id === fid));
      await denied(() =>
        send(a, randomUUID(), "Expired attachment", { p_attachments: [fid] }),
      );
    },
  );
  await check(
    "account deletion safely tombstones both owned roots and replies",
    async () => {
      await admin();
      const root = randomUUID(),
        child = randomUUID();
      await db.query(
        "insert into public.messages(id,channel_id,author_id,body) values($1,$2,$3,'Owned root')",
        [root, channel, c],
      );
      await db.query(
        "insert into public.messages(id,channel_id,author_id,parent_id,body) values($1,$2,$3,$4,'Owned reply')",
        [child, channel, c, root],
      );
      // Use the other fixture identity so subsequent stale-identity checks remain valid.
      await db.query("delete from auth.users where id=$1", [c]);
      const rows = await db.query(
        "select author_id,body,deleted_at from public.messages where id=any($1)",
        [[root, child]],
      );
      assert.ok(
        rows.rows.every(
          (m) => m.author_id === null && m.body === "" && m.deleted_at,
        ),
      );
    },
  );
  await check(
    "anonymous calls and stale unverified identities are denied",
    async () => {
      await role(null);
      await denied(() => db.query("select * from public.messages"));
      await denied(() => db.query("select public.chat_page($1)", [channel]));
      await admin();
      await db.query(
        "update auth.users set email_confirmed_at=null where id=$1",
        [a],
      );
      await denied(() => rpc(a, "chat_page", { p_channel: channel }));
    },
  );
  await check("all exposed messaging tables enforce RLS", async () => {
    await admin();
    const rows = await db.query(
      "select relrowsecurity from pg_class where relnamespace='public'::regnamespace and relname=any($1)",
      [
        [
          "messages",
          "message_reactions",
          "message_attachments",
          "read_receipts",
          "message_link_previews",
        ],
      ],
    );
    assert.equal(rows.rowCount, 5);
    assert.ok(rows.rows.every((r) => r.relrowsecurity));
  });
  console.log(`${checks} messaging database checks passed (rolled back).`);
} finally {
  await db.query("rollback");
  await db.end();
}
