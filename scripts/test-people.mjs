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
const [a, b, c] = Array.from({ length: 3 }, () => randomUUID());
let checks = 0;
async function admin() {
  await db.query("reset role");
}
async function role(id) {
  await admin();
  await db.query(id ? "set local role authenticated" : "set local role anon");
  await db.query(
    "select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)",
    [
      id || "",
      JSON.stringify({ sub: id, role: id ? "authenticated" : "anon" }),
    ],
  );
}
async function rpc(id, name, args = {}) {
  await role(id);
  return (
    await db.query(
      `select public.${name}(${Object.keys(args)
        .map((k, i) => `${k}=>$${i + 1}`)
        .join(",")}) value`,
      Object.values(args),
    )
  ).rows[0].value;
}
const cmd = (id, op, data = {}) =>
  rpc(id, "people_command", { p_operation: op, p_data: data });
const home = (id) => rpc(id, "people_home");
const history = (id, con, before = null) =>
  rpc(id, "dm_history", { p_conversation: con, p_before: before });
async function denied(fn, code = "42501") {
  await db.query("savepoint reject");
  let caught = false;
  try {
    await fn();
  } catch (e) {
    caught = true;
    assert.equal(e.code, code);
  } finally {
    await db.query("rollback to savepoint reject");
    await db.query("release savepoint reject");
  }
  assert.ok(caught, "Expected denial");
}
async function check(name, fn) {
  await fn();
  checks++;
  console.log("PASS " + name);
  await admin();
  await db.query("delete from private.people_budgets");
}
const privacy = {
  discoverable: true,
  allow_requests: true,
  dm_policy: "friends",
  share_presence: false,
};
let conv, message;
try {
  await db.query("begin");
  for (const id of [a, b, c]) {
    await db.query(
      `insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values($1,$2,now(),'{"date_of_birth":"1990-01-01"}')`,
      [id, id + "@example.test"],
    );
    await db.query(
      "update public.profiles set username=$2,display_name='People fixture',onboarding_completed_at=now(),visibility='members' where id=$1",
      [id, "people_" + id.slice(0, 8)],
    );
    await db.query(
      "update public.user_preferences set interests=array['co-op'] where user_id=$1",
      [id],
    );
  }
  await check(
    "defaults share presence but keep discovery opt-in and reject stranger DMs",
    async () => {
      assert.equal((await home(a)).privacy.discoverable, false);
      assert.equal((await home(a)).privacy.share_presence, true);
      assert.equal((await rpc(a, "people_search")).items.length, 0);
      await denied(() => cmd(a, "open", { target: b }));
    },
  );
  for (const id of [a, b, c]) await cmd(id, "privacy", privacy);
  await check(
    "search returns permitted shared interests without emails or auth data",
    async () => {
      const found = await rpc(a, "people_search");
      assert.equal(found.items.length, 2);
      assert.deepEqual(found.items[0].shared, ["co-op"]);
      assert.doesNotMatch(
        JSON.stringify(found),
        /@example|email|last_seen|date_of_birth/,
      );
    },
  );
  await check(
    "private profiles stay outside discovery even if opted in",
    async () => {
      await admin();
      await db.query(
        "update public.profiles set visibility='private' where id=$1",
        [b],
      );
      assert.ok(!(await rpc(a, "people_search")).items.some((p) => p.id === b));
      await db.query("reset role");
      await db.query(
        "update public.profiles set visibility='members' where id=$1",
        [b],
      );
    },
  );
  await check(
    "requests notify only recipient and cannot be self-accepted",
    async () => {
      await cmd(a, "request", { target: b });
      assert.equal((await home(b)).friends[0].relationship, "incoming");
      assert.equal((await home(b)).notifications[0].kind, "friend_request");
      assert.equal((await home(c)).notifications.length, 0);
      await denied(() => cmd(a, "accept", { target: b }));
    },
  );
  await check(
    "duplicate requests are idempotent and crossing request does not auto-accept",
    async () => {
      await cmd(a, "request", { target: b });
      await cmd(b, "request", { target: a });
      assert.equal((await home(b)).notifications.length, 1);
      assert.equal((await home(a)).friends[0].relationship, "outgoing");
    },
  );
  await check(
    "only correct sender cancels, only recipient declines",
    async () => {
      await denied(() => cmd(b, "cancel", { target: a }));
      await denied(() => cmd(a, "decline", { target: b }));
      await cmd(b, "decline", { target: a });
      assert.equal((await home(a)).friends.length, 0);
      await cmd(a, "request", { target: b });
      await cmd(a, "cancel", { target: b });
      assert.equal((await home(b)).friends.length, 0);
      await cmd(a, "request", { target: b });
      await cmd(b, "accept", { target: a });
    },
  );
  await check(
    "accepted friends can create one conversation with reverse-order idempotency",
    async () => {
      conv = (await cmd(a, "open", { target: b })).id;
      assert.equal((await cmd(b, "open", { target: a })).id, conv);
      assert.equal((await home(a)).friends[0].relationship, "friends");
    },
  );
  await check(
    "strangers cannot read messages, conversation preferences or private topics",
    async () => {
      await denied(() => history(c, conv));
      assert.equal(
        await rpc(c, "people_topic_allowed", { p_topic: "dm:" + conv }),
        false,
      );
      assert.equal(
        await rpc(c, "people_topic_allowed", { p_topic: "people:" + a }),
        false,
      );
      await role(c);
      assert.equal(
        (await db.query("select * from public.conversations")).rowCount,
        0,
      );
      assert.equal(
        (await db.query("select * from public.direct_messages")).rowCount,
        0,
      );
      assert.equal(
        (await db.query("select * from public.conversation_preferences"))
          .rowCount,
        0,
      );
    },
  );
  await check(
    "private topics authorize only participants and owner notification topic",
    async () => {
      assert.equal(
        await rpc(a, "people_topic_allowed", { p_topic: "dm:" + conv }),
        true,
      );
      assert.equal(
        await rpc(a, "people_topic_allowed", { p_topic: "people:" + a }),
        true,
      );
      assert.equal(
        await rpc(a, "people_topic_allowed", { p_topic: "dm:not-a-uuid" }),
        false,
      );
    },
  );
  await check(
    "messages persist once on stable retry, sender cannot spoof another conversation",
    async () => {
      message = randomUUID();
      await cmd(a, "send", {
        conversation: conv,
        id: message,
        body: "Hello **friend**",
      });
      await cmd(a, "send", {
        conversation: conv,
        id: message,
        body: "Hello **friend**",
      });
      assert.equal((await history(b, conv)).items.length, 1);
      assert.equal((await history(b, conv)).items[0].sender, a);
      await denied(() =>
        cmd(c, "send", {
          conversation: conv,
          id: randomUUID(),
          body: "Intrusion",
        }),
      );
      await denied(() =>
        cmd(b, "send", { conversation: conv, id: message, body: "Spoof" }),
      );
    },
  );
  await check(
    "read cursors cap at persisted messages and unread excludes sender",
    async () => {
      assert.equal(Number((await home(b)).conversations[0].unread), 1);
      assert.equal(Number((await home(a)).conversations[0].unread), 0);
      await cmd(b, "read", { conversation: conv, seq: "999999999999999999" });
      assert.equal(Number((await home(b)).conversations[0].unread), 0);
    },
  );
  await check(
    "mute is owner-scoped and does not destroy unread counts",
    async () => {
      await cmd(b, "mute", { conversation: conv, muted: true });
      await cmd(a, "send", {
        conversation: conv,
        id: randomUUID(),
        body: "Second",
      });
      assert.equal((await home(b)).conversations[0].muted, true);
      assert.equal((await home(a)).conversations[0].muted, false);
      assert.equal(Number((await home(b)).conversations[0].unread), 1);
    },
  );
  await check(
    "only recipient can report an actual message; reports have private moderation status",
    async () => {
      await cmd(b, "report", {
        conversation: conv,
        message,
        reason: "Abusive language",
      });
      await cmd(b, "report", {
        conversation: conv,
        message,
        reason: "Duplicate report",
      });
      await denied(() =>
        cmd(a, "report", {
          conversation: conv,
          message,
          reason: "Not received",
        }),
      );
      await role(b);
      const rows = await db.query(
        "select * from public.direct_message_reports",
      );
      assert.equal(rows.rowCount, 1);
      assert.equal(rows.rows[0].status, "pending");
      await role(c);
      assert.equal(
        (await db.query("select * from public.direct_message_reports"))
          .rowCount,
        0,
      );
    },
  );
  await check(
    "recipient policy changes immediately reject new messages but preserve participant history",
    async () => {
      await cmd(b, "privacy", { ...privacy, dm_policy: "nobody" });
      await denied(() =>
        cmd(a, "send", {
          conversation: conv,
          id: randomUUID(),
          body: "Unwanted",
        }),
      );
      assert.equal((await history(a, conv)).can_send, false);
      assert.ok((await history(b, conv)).items.length);
      await cmd(b, "privacy", privacy);
    },
  );
  await check(
    "presence opt-out is respected and only sharing friends see online and offline states",
    async () => {
      assert.equal((await history(a, conv)).member.online, null);
      await cmd(b, "privacy", { ...privacy, share_presence: true });
      await cmd(b, "heartbeat");
      assert.equal((await history(a, conv)).member.online, true);
      assert.equal(
        (await rpc(c, "people_search")).items.find((p) => p.id === b).online,
        null,
      );
      await admin();
      await db.query(
        "update public.member_privacy set last_seen=now()-interval '2 minutes' where user_id=$1",
        [b],
      );
      assert.equal((await history(a, conv)).member.online, false);
    },
  );
  await check(
    "raw message writes, edits, deletes and identity/role escalation are denied",
    async () => {
      await role(a);
      await denied(() =>
        db.query(
          "insert into public.direct_messages(id,conversation_id,sender_id,body) values($1,$2,$3,'Spoof')",
          [randomUUID(), conv, b],
        ),
      );
      await denied(() =>
        db.query(
          "update public.direct_messages set body='Changed' where id=$1",
          [message],
        ),
      );
      await denied(() =>
        db.query("delete from public.direct_messages where id=$1", [message]),
      );
      await denied(() =>
        db.query(
          "update public.member_privacy set dm_policy='members' where user_id=$1",
          [b],
        ),
      );
    },
  );
  await check(
    "friend removal immediately closes default incoming DMs",
    async () => {
      await cmd(a, "remove", { target: b });
      await denied(() =>
        cmd(a, "send", {
          conversation: conv,
          id: randomUUID(),
          body: "No longer friends",
        }),
      );
      await cmd(b, "privacy", { ...privacy, dm_policy: "members" });
      await cmd(a, "send", {
        conversation: conv,
        id: randomUUID(),
        body: "Explicit opt-in",
      });
    },
  );
  await check(
    "mutual block removes friends and requests, hides search/profile/avatar, denies DMs and topics",
    async () => {
      await cmd(a, "request", { target: b });
      await cmd(b, "accept", { target: a });
      await cmd(a, "block", { target: b });
      assert.equal((await home(a)).friends.length, 0);
      assert.equal((await home(b)).friends.length, 0);
      assert.equal((await home(b)).conversations.length, 0);
      assert.ok(!(await rpc(b, "people_search")).items.some((p) => p.id === a));
      await denied(() => history(a, conv));
      await denied(() =>
        cmd(b, "send", {
          conversation: conv,
          id: randomUUID(),
          body: "Blocked",
        }),
      );
      assert.equal(
        await rpc(a, "people_topic_allowed", { p_topic: "dm:" + conv }),
        false,
      );
      await role(b);
      assert.equal(
        (await db.query("select * from public.direct_messages")).rowCount,
        0,
      );
      assert.equal(
        (
          await db.query("select * from public.visible_profile($1)", [
            "people_" + a.slice(0, 8),
          ])
        ).rowCount,
        0,
      );
      assert.equal(await rpc(b, "visible_avatar", { p_id: a }), null);
    },
  );
  await check(
    "blocked invitation issuers cannot admit a blocked member through bearer links",
    async () => {
      await admin();
      const community = randomUUID(),
        token = "b".repeat(64);
      await db.query(
        "insert into public.communities(id,slug,name,visibility) values($1,$2,'Private invite test','private')",
        [community, "people-" + community.slice(0, 8)],
      );
      await db.query(
        "insert into public.community_members(community_id,user_id,role_id) values($1,$2,'owner')",
        [community, a],
      );
      await db.query(
        "insert into public.invitations(community_id,token_digest,invited_by,expires_at) values($1,encode(sha256(convert_to($2,'UTF8')),'hex'),$3,now()+interval '1 hour')",
        [community, token, a],
      );
      await denied(() =>
        rpc(b, "community_command", {
          p_operation: "accept_invite",
          p_data: { token },
        }),
      );
      await admin();
      assert.equal(
        (
          await db.query(
            "select * from public.community_members where community_id=$1 and user_id=$2",
            [community, b],
          )
        ).rowCount,
        0,
      );
    },
  );
  await check(
    "unblock does not restore friendships and is owner-only",
    async () => {
      await cmd(b, "unblock", { target: a });
      assert.equal((await home(b)).conversations.length, 0);
      await cmd(a, "unblock", { target: b });
      assert.equal((await home(a)).friends.length, 0);
      assert.equal((await history(a, conv)).can_send, true);
    },
  );
  await check("request opt-out rejects requests on server", async () => {
    await cmd(c, "privacy", { ...privacy, allow_requests: false });
    await denied(() => cmd(a, "request", { target: c }));
  });
  await check(
    "spam budgets enforce send, request, search and malformed operations",
    async () => {
      for (let i = 0; i < 30; i++)
        assert.equal(
          await rpc(a, "people_budget", { p_operation: "send" }),
          true,
        );
      assert.equal(
        await rpc(a, "people_budget", { p_operation: "send" }),
        false,
      );
      assert.equal(
        (
          await cmd(a, "send", {
            conversation: conv,
            id: randomUUID(),
            body: "Spam",
          })
        ).limited,
        true,
      );
      for (let i = 0; i < 10; i++)
        assert.equal(
          await rpc(b, "people_budget", { p_operation: "request" }),
          true,
        );
      assert.equal(
        await rpc(b, "people_budget", { p_operation: "request" }),
        false,
      );
      for (let i = 0; i < 30; i++) await rpc(c, "people_search");
      assert.equal((await rpc(c, "people_search")).limited, true);
      assert.equal(
        await rpc(a, "people_budget", { p_operation: "fake" }),
        false,
      );
    },
  );
  await check(
    "history cursor pagination has stable ordering and no overlapping rows",
    async () => {
      await admin();
      for (let i = 0; i < 65; i++)
        await db.query(
          "insert into public.direct_messages(id,conversation_id,sender_id,body) values($1,$2,$3,$4)",
          [randomUUID(), conv, a, "Paged " + i],
        );
      const first = await history(b, conv);
      const second = await history(b, conv, first.items[0].seq);
      assert.equal(first.items.length, 50);
      assert.ok(second.items.length > 0);
      assert.equal(
        new Set([...first.items, ...second.items].map((m) => m.id)).size,
        first.items.length + second.items.length,
      );
    },
  );
  await check(
    "suspended users cannot read or subscribe with a still valid JWT",
    async () => {
      await admin();
      await db.query(
        "update auth.users set banned_until=now()+interval '1 day' where id=$1",
        [b],
      );
      await denied(() => history(b, conv));
      assert.equal(
        await rpc(b, "people_topic_allowed", { p_topic: "dm:" + conv }),
        false,
      );
      await admin();
      await db.query("update auth.users set banned_until=null where id=$1", [
        b,
      ]);
    },
  );
  await check("anonymous access is rejected", async () => {
    await denied(() => rpc(null, "people_home"));
    await denied(() => rpc(null, "dm_history", { p_conversation: conv }));
  });
  console.log(`${checks} People database checks passed (rolled back).`);
} finally {
  await db.query("rollback");
  await db.end();
}
