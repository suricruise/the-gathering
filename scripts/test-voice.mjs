import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import pg from "pg";
import { createClient } from "@supabase/supabase-js";
import { RoomServiceClient } from "livekit-server-sdk";
import { enforceVoice } from "./voice-enforcement.mjs";
const env = parseEnv(readFileSync(".env.local", "utf8"));
const connectionString = readFileSync(
  ".local-stack/database-url",
  "utf8",
).trim();
for (const url of [
  env.NEXT_PUBLIC_SUPABASE_URL,
  connectionString,
  env.LIVEKIT_URL,
])
  if (!["localhost", "127.0.0.1"].includes(new URL(url).hostname))
    throw Error("Local only");
const admin = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SECRET_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const livekit = new RoomServiceClient(
  env.LIVEKIT_URL.replace(/^ws/, "http"),
  env.LIVEKIT_API_KEY,
  env.LIVEKIT_API_SECRET,
);
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
        .join(",")}) as v`,
      Object.values(args),
    )
  ).rows[0].v;
}
async function denied(fn, code = "42501") {
  await db.query("savepoint denial");
  let caught = false;
  try {
    await fn();
  } catch (e) {
    caught = true;
    assert.equal(e.code, code);
  } finally {
    await db.query("rollback to savepoint denial; release savepoint denial");
  }
  assert.ok(caught);
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
      `insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values($1,$2,now(),'{"date_of_birth":"1990-01-01"}')`,
      [id, `${id}@example.test`],
    );
  const community = randomUUID(),
    channel = randomUUID(),
    text = randomUUID();
  await db.query(
    "insert into public.communities(id,slug,name,visibility) values($1,$2,'Voice test','private')",
    [community, `voice-${community.slice(0, 8)}`],
  );
  await db.query(
    "insert into public.community_members(community_id,user_id,role_id) values($1,$2,'owner'),($1,$3,'member')",
    [community, a, b],
  );
  await db.query(
    "insert into public.channels(id,community_id,name,kind,is_private) values($1,$2,'voice-test','voice',true),($3,$2,'text-test','text',false)",
    [channel, community, text],
  );
  await db.query(
    "insert into public.channel_permission_overrides(community_id,channel_id,user_id,can_view,can_connect) values($1,$2,$3,true,true)",
    [community, channel, b],
  );
  await check("anonymous and outsider admissions rejected", async () => {
    await denied(() => rpc(null, "voice_admit", { p_channel: channel }));
    await denied(() => rpc(c, "voice_admit", { p_channel: channel }));
  });
  await check("text channels cannot mint voice tokens", async () => {
    await denied(() => rpc(a, "voice_admit", { p_channel: text }));
  });
  await check("stale enforcement worker blocks admission", async () => {
    await db.query(
      "reset role; update private.voice_worker set checked_at='1970-01-01'",
    );
    await denied(() => rpc(a, "voice_admit", { p_channel: channel }), "55000");
    await db.query(
      "reset role; update private.voice_worker set checked_at=now()",
    );
  });
  let admission;
  await check(
    "private member admission derives room identity and reserves capacity",
    async () => {
      admission = await rpc(b, "voice_admit", { p_channel: channel });
      assert.match(admission.room, /^tg_[a-f0-9]{32}_[a-f0-9]{32}$/);
      assert.equal(admission.limit, 12);
      assert.ok(admission.ticket);
    },
  );
  await check("only one live session per identity", async () => {
    await denied(() => rpc(b, "voice_admit", { p_channel: channel }), "55000");
  });
  await check("ticket cannot be used by another identity", async () => {
    await denied(() => rpc(c, "voice_session", { p_ticket: admission.ticket }));
  });
  await check("session heartbeat rechecks permission", async () => {
    assert.equal(
      (await rpc(b, "voice_session", { p_ticket: admission.ticket })).allowed,
      true,
    );
  });
  await check("direct session and room writes rejected by RLS", async () => {
    await denied(async () => {
      await role(b);
      await db.query("update public.voice_rooms set locked=false");
    });
    await denied(async () => {
      await role(b);
      await db.query("select * from private.voice_sessions");
    });
  });
  await check(
    "service snapshots and worker heartbeat denied to members",
    async () => {
      await denied(() => rpc(b, "voice_enforcement_snapshot"));
      await denied(() => rpc(b, "voice_worker_heartbeat"));
    },
  );
  await check("member cannot moderate or change capacity", async () => {
    await denied(() =>
      rpc(b, "voice_command", {
        p_channel: channel,
        p_operation: "remove",
        p_target: a,
      }),
    );
    await denied(() =>
      rpc(b, "voice_command", {
        p_channel: channel,
        p_operation: "settings",
        p_limit: 50,
        p_locked: false,
      }),
    );
  });
  await check(
    "moderation is audited and creates a server-enforced suspension",
    async () => {
      await rpc(a, "voice_command", {
        p_channel: channel,
        p_operation: "remove",
        p_target: b,
      });
      await denied(() => rpc(b, "voice_admit", { p_channel: channel }));
      await db.query("reset role");
      assert.equal(
        (
          await db.query(
            "select count(*)::int n from public.community_audit_log where community_id=$1 and action='voice_remove'",
            [community],
          )
        ).rows[0].n,
        1,
      );
      await db.query("delete from private.voice_suspensions where user_id=$1", [
        b,
      ]);
    },
  );
  await check(
    "locked room rejects even owner joins and rotates room name",
    async () => {
      await rpc(a, "voice_command", {
        p_channel: channel,
        p_operation: "settings",
        p_limit: 2,
        p_locked: true,
      });
      await denied(() => rpc(a, "voice_admit", { p_channel: channel }));
      await rpc(a, "voice_command", {
        p_channel: channel,
        p_operation: "settings",
        p_limit: 2,
        p_locked: false,
      });
      const next = await rpc(b, "voice_admit", { p_channel: channel });
      assert.notEqual(next.room, admission.room);
      admission = next;
    },
  );
  await check(
    "participant limit enforced in transactional reservations",
    async () => {
      await db.query(
        "reset role; update private.voice_worker set checked_at=now()",
      );
      await rpc(a, "voice_admit", { p_channel: channel });
      await db.query("reset role");
      await db.query(
        "insert into public.community_members values($1,$2,'member','active',now())",
        [community, c],
      );
      await db.query(
        "insert into public.channel_permission_overrides(community_id,channel_id,user_id,can_view) values($1,$2,$3,true)",
        [community, channel, c],
      );
      await denied(
        () => rpc(c, "voice_admit", { p_channel: channel }),
        "54000",
      );
    },
  );
  await check("explicit connect denial overrides private grant", async () => {
    await db.query("reset role");
    await db.query(
      "update public.channel_permission_overrides set can_connect=false where channel_id=$1 and user_id=$2",
      [channel, b],
    );
    assert.equal(
      (await rpc(b, "voice_session", { p_ticket: admission.ticket })).allowed,
      false,
    );
    await denied(() => rpc(b, "voice_admit", { p_channel: channel }));
    await db.query("reset role");
    await db.query(
      "update public.channel_permission_overrides set can_connect=true where channel_id=$1 and user_id=$2",
      [channel, b],
    );
  });
  await check(
    "banned or globally suspended identities cannot join",
    async () => {
      await db.query("reset role");
      await db.query(
        "update public.community_members set status='banned' where community_id=$1 and user_id=$2",
        [community, b],
      );
      await denied(() => rpc(b, "voice_admit", { p_channel: channel }));
      await db.query("reset role");
      await db.query(
        "update public.community_members set status='active' where community_id=$1 and user_id=$2",
        [community, b],
      );
      await db.query(
        "update auth.users set banned_until=now()+interval '1 hour' where id=$1",
        [b],
      );
      await denied(() => rpc(b, "voice_admit", { p_channel: channel }));
    },
  );
  await check("moderators cannot remove owners or peers", async () => {
    await db.query("reset role");
    await db.query(
      "update public.community_members set role_id='moderator' where community_id=$1 and user_id=$2",
      [community, c],
    );
    await denied(() =>
      rpc(c, "voice_command", {
        p_channel: channel,
        p_operation: "remove",
        p_target: a,
      }),
    );
  });
  await check(
    "HTTP admission budget persists denials and rejects excess token attempts",
    async () => {
      for (let i = 0; i < 10; i++)
        assert.equal(
          await rpc(a, "voice_request_budget", { p_operation: "token" }),
          true,
        );
      assert.equal(
        await rpc(a, "voice_request_budget", { p_operation: "token" }),
        false,
      );
      assert.equal(
        await rpc(a, "voice_request_budget", { p_operation: "arbitrary" }),
        false,
      );
    },
  );
  await db.query("rollback");
  await check(
    "real LiveKit room service supports capacity and deletion without recording",
    async () => {
      const name = `tg_${randomUUID().replaceAll("-", "")}_${randomUUID().replaceAll("-", "")}`;
      const room = await livekit.createRoom({
        name,
        maxParticipants: 2,
        emptyTimeout: 60,
      });
      assert.equal(room.maxParticipants, 2);
      assert.equal(room.activeRecording, false);
      await enforceVoice(admin, livekit);
      assert.equal((await livekit.listRooms([name])).length, 0);
    },
  );
  console.log(
    `${checks} voice database and real LiveKit service checks passed.`,
  );
} finally {
  await db.query("rollback");
  await db.end();
}
