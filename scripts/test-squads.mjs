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
const [a, b, c, d] = Array.from({ length: 4 }, () => randomUUID());
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
      id ?? "",
      JSON.stringify({
        sub: id ?? undefined,
        role: id ? "authenticated" : "anon",
      }),
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
const cmd = (id, operation, data) =>
  rpc(id, "squad_command", { p_operation: operation, p_data: data });
const detail = (id, session) => rpc(id, "squad_detail", { p_session: session });
async function denied(fn, code = "42501") {
  await db.query("savepoint rejection");
  let caught = false;
  try {
    await fn();
  } catch (e) {
    caught = true;
    assert.equal(e.code, code);
  } finally {
    await db.query("rollback to savepoint rejection");
    await db.query("release savepoint rejection");
  }
  assert.ok(caught, "Expected denial");
}
async function check(name, fn) {
  await fn();
  checks++;
  console.log("PASS " + name);
  await admin();
  await db.query("delete from private.squad_budgets");
}
const make = (id, extra = {}) =>
  cmd(id, "create", {
    id: randomUUID(),
    title: "Local test squad",
    description: "Real database authorization fixture",
    game: "minecraft",
    platform: "pc",
    cross_play: true,
    style: "casual",
    max_players: 3,
    approval: false,
    visibility: "public",
    community: null,
    game_night: false,
    starts_at: null,
    ...extra,
  });
try {
  await db.query("begin");
  for (const id of [a, b, c, d]) {
    await db.query(
      'insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values($1,$2,now(),\'{"date_of_birth":"1990-01-01"}\')',
      [id, id + "@example.test"],
    );
    await db.query(
      "update public.profiles set display_name=$2,username=$3,onboarding_completed_at=now() where id=$1",
      [id, "Squad " + id.slice(0, 4), "squad_" + id.slice(0, 8)],
    );
  }
  const community = randomUUID();
  await db.query(
    "insert into public.communities(id,slug,name,visibility) values($1,$2,'Private squad fixture','private')",
    [community, "squad-" + community.slice(0, 8)],
  );
  await db.query(
    "insert into public.community_members(community_id,user_id,role_id) values($1,$2,'owner'),($1,$3,'member')",
    [community, a, b],
  );
  let open, approval, communitySession, friendSession;
  await check(
    "all eight Squad Up catalog/user/operational tables enable RLS",
    async () => {
      await admin();
      assert.equal(
        (
          await db.query(
            "select count(*)::int n from pg_class t join pg_namespace n on n.oid=t.relnamespace where t.relrowsecurity and ((n.nspname='public' and t.relname in ('game_platforms','gaming_sessions','gaming_session_members','member_blocks')) or (n.nspname='private' and t.relname in ('squad_config','squad_audit','squad_voice_sessions','squad_budgets')))",
          )
        ).rows[0].n,
        8,
      );
    },
  );
  await check(
    "server derives the host, reserves exactly one place and retries stable IDs",
    async () => {
      const id = randomUUID();
      await make(a, { id, host_id: b });
      await make(a, { id, title: "Retry changed title" });
      open = id;
      const s = await detail(a, id);
      assert.equal(s.host_id, a);
      assert.equal(s.title, "Local test squad");
      assert.equal(s.accepted_count, 1);
      await denied(() => make(b, { id }));
    },
  );
  await check(
    "anonymous and stale identities cannot access discovery or commands",
    async () => {
      await denied(() => rpc(null, "squad_list"));
      await denied(() => make(null));
      await denied(() => make(randomUUID()));
    },
  );
  await check(
    "private host identity and roster are not activity disclosures",
    async () => {
      const s = await detail(b, open);
      assert.equal(s.host_name, "Private host");
      assert.equal(s.host_id, null);
      assert.deepEqual(s.members, []);
      await role(b);
      await denied(() =>
        db.query("select host_id from public.gaming_sessions"),
      );
      assert.equal(
        (
          await db.query(
            "select count(*)::int n from public.gaming_session_members where session_id=$1",
            [open],
          )
        ).rows[0].n,
        0,
      );
    },
  );
  await check(
    "private community games never enter outsider queries or direct reads",
    async () => {
      communitySession = (await make(a, { visibility: "community", community }))
        .id;
      assert.equal(await detail(c, communitySession), null);
      assert.ok(await detail(b, communitySession));
      assert.ok(
        !(await rpc(c, "squad_list")).items.some(
          (s) => s.id === communitySession,
        ),
      );
      await denied(() =>
        cmd(c, "join", { session: communitySession, platform: "pc" }),
      );
    },
  );
  await check(
    "friends-only requires accepted friendships; reciprocal follows are insufficient",
    async () => {
      friendSession = (await make(a, { visibility: "friends" })).id;
      await admin();
      await db.query("insert into public.follows values($1,$2,now())", [b, a]);
      assert.equal(await detail(b, friendSession), null);
      await admin();
      await db.query("insert into public.follows values($1,$2,now())", [a, b]);
      assert.equal(await detail(b, friendSession), null);
      await admin();
      await db.query(
        "insert into public.friendships(low_id,high_id,requested_by,status) values(least($1::uuid,$2::uuid),greatest($1::uuid,$2::uuid),$1,'accepted')",
        [a, b],
      );
      assert.ok(await detail(b, friendSession));
      assert.equal(await detail(c, friendSession), null);
    },
  );
  await check(
    "cross-play pool and platform selection are enforced",
    async () => {
      await denied(
        () => make(a, { game: "valorant", platform: "pc", cross_play: true }),
        "22023",
      );
      await denied(
        () => make(a, { game: "valorant", platform: "mobile" }),
        "23503",
      );
      await denied(
        () => cmd(b, "join", { session: open, platform: "invented" }),
        "22023",
      );
      const same = (await make(b, { cross_play: false })).id;
      await denied(
        () => cmd(c, "join", { session: same, platform: "xbox" }),
        "22023",
      );
      await cmd(b, "join", { session: open, platform: "xbox" });
    },
  );
  await check(
    "duplicate joins never reserve a second place and full groups reject others",
    async () => {
      await cmd(b, "join", { session: open, platform: "xbox" });
      await cmd(c, "join", { session: open, platform: "pc" });
      await cmd(c, "join", { session: open, platform: "pc" });
      assert.equal((await detail(a, open)).accepted_count, 3);
      assert.equal((await detail(a, open)).state, "full");
      await denied(
        () => cmd(d, "join", { session: open, platform: "pc" }),
        "54000",
      );
    },
  );
  await check(
    "withdrawal frees a place and hosts must cancel instead of withdrawing",
    async () => {
      await denied(() => cmd(a, "withdraw", { session: open }), "22023");
      await cmd(c, "withdraw", { session: open });
      assert.equal((await detail(a, open)).state, "open");
      await cmd(d, "join", { session: open, platform: "pc" });
      assert.equal((await detail(d, open)).members.length, 3);
    },
  );
  await check(
    "host approval reserves no place until approved and grants no pending voice",
    async () => {
      approval = (await make(b, { approval: true, max_players: 2 })).id;
      const pending = await cmd(c, "join", {
        session: approval,
        platform: "pc",
      });
      assert.equal(pending.status, "pending");
      assert.equal((await detail(b, approval)).accepted_count, 1);
      assert.equal((await detail(b, approval)).pending_count, 1);
      await denied(() => rpc(c, "voice_admit", { p_channel: approval }));
      await denied(() => cmd(c, "approve", { session: approval, target: c }));
      await cmd(b, "approve", { session: approval, target: c });
      assert.equal((await detail(c, approval)).voice_allowed, true);
    },
  );
  await check(
    "host decisions and audience references cannot target another session",
    async () => {
      await denied(() => cmd(c, "cancel", { session: approval }));
      await denied(() => cmd(b, "remove", { session: approval, target: d }));
      await denied(() => make(b, { community, visibility: "public" }), "23514");
    },
  );
  await check(
    "only community staff can publish game-night listings",
    async () => {
      await denied(() =>
        make(b, { visibility: "community", community, game_night: true }),
      );
      const s = (
        await make(a, { visibility: "community", community, game_night: true })
      ).id;
      assert.ok(
        (await rpc(b, "squad_list", { p_mode: "game-nights" })).items.some(
          (r) => r.id === s,
        ),
      );
      assert.ok(
        !(await rpc(c, "squad_list", { p_mode: "game-nights" })).items.some(
          (r) => r.id === s,
        ),
      );
    },
  );
  await check(
    "direct writes, budgets, configuration, audit and private voice helpers are protected",
    async () => {
      await denied(async () => {
        await role(a);
        await db.query(
          "update public.gaming_sessions set max_players=50 where id=$1",
          [open],
        );
      });
      await denied(async () => {
        await role(c);
        await db.query(
          "insert into public.gaming_session_members values($1,$2,'pc','accepted',now(),now())",
          [open, c],
        );
      });
      for (const table of [
        "squad_config",
        "squad_audit",
        "squad_voice_sessions",
      ])
        await denied(async () => {
          await role(a);
          await db.query(`select * from private.${table}`);
        });
      await denied(() => rpc(a, "squad_cleanup"));
      await denied(async () => {
        await role(a);
        await db.query("select private.community_voice_admit($1)", [open]);
      });
    },
  );
  await check(
    "full approval groups cannot approve a competing pending request",
    async () => {
      await denied(
        () => cmd(d, "join", { session: approval, platform: "pc" }),
        "54000",
      );
    },
  );
  await check(
    "only approved membership obtains room-scoped group admissions",
    async () => {
      await admin();
      await db.query(
        "update private.voice_worker set checked_at=clock_timestamp()",
      );
      const admission = await rpc(c, "voice_admit", { p_channel: approval });
      assert.equal(admission.limit, 2);
      assert.equal(admission.destination, "/squad-up/" + approval);
      assert.ok(/^tg_[a-f0-9]{32}_[a-f0-9]{32}$/.test(admission.room));
      assert.equal(
        (await rpc(c, "voice_session", { p_ticket: admission.ticket })).allowed,
        true,
      );
      await denied(() => rpc(d, "voice_admit", { p_channel: approval }));
      await denied(() =>
        rpc(d, "voice_session", { p_ticket: admission.ticket }),
      );
      await denied(() => rpc(c, "voice_admit", { p_channel: open }), "55000");
      await rpc(c, "voice_session", {
        p_ticket: admission.ticket,
        p_leave: true,
      });
    },
  );
  await check(
    "future session voice does not open before its configured early window",
    async () => {
      await admin();
      await db.query(
        "update public.gaming_sessions set starts_at=now()+interval '1 day',expires_at=now()+interval '2 days' where id=$1",
        [approval],
      );
      assert.equal((await detail(c, approval)).voice_allowed, false);
      await denied(() => rpc(c, "voice_admit", { p_channel: approval }));
      await admin();
      await db.query(
        "update public.gaming_sessions set starts_at=null where id=$1",
        [approval],
      );
    },
  );
  await check(
    "stale enforcement health cannot issue group tokens",
    async () => {
      await admin();
      await db.query(
        "update private.voice_worker set checked_at=now()-interval '1 hour'",
      );
      await denied(
        () => rpc(c, "voice_admit", { p_channel: approval }),
        "55000",
      );
      await admin();
      await db.query(
        "update private.voice_worker set checked_at=clock_timestamp()",
      );
    },
  );
  await check(
    "host removal revokes existing voice refresh and enforcement snapshot entries",
    async () => {
      const v = await rpc(c, "voice_admit", { p_channel: approval });
      await cmd(b, "remove", { session: approval, target: c });
      await denied(() => rpc(c, "voice_session", { p_ticket: v.ticket }));
      await denied(() => rpc(c, "voice_admit", { p_channel: approval }));
      await admin();
      const snapshot = (
        await db.query("select public.voice_enforcement_snapshot() value")
      ).rows[0].value;
      assert.ok(!snapshot.sessions.some((s) => s.ticket === v.ticket));
      assert.ok(Array.isArray(snapshot.rooms));
      await denied(() => rpc(c, "voice_enforcement_snapshot"));
    },
  );
  await check(
    "cancellation is host-only, idempotent and ends joining and voice",
    async () => {
      await cmd(b, "cancel", { session: approval });
      await cmd(b, "cancel", { session: approval });
      assert.equal((await detail(b, approval)).state, "cancelled");
      await denied(
        () => cmd(d, "join", { session: approval, platform: "pc" }),
        "55000",
      );
      await denied(() => rpc(b, "voice_admit", { p_channel: approval }));
    },
  );
  await check(
    "expiration denies admissions at request time without a cleanup job",
    async () => {
      await admin();
      await db.query(
        "update public.gaming_sessions set expires_at=clock_timestamp()-interval '1 second',created_at=now()-interval '2 days' where id=$1",
        [open],
      );
      assert.equal((await detail(a, open)).state, "expired");
      await denied(
        () => cmd(c, "join", { session: open, platform: "pc" }),
        "55000",
      );
      await denied(() => rpc(a, "voice_admit", { p_channel: open }));
    },
  );
  await check(
    "blocking a host separates groups, hides access, and unblocking does not restore slots",
    async () => {
      await cmd(b, "join", { session: friendSession, platform: "pc" });
      await cmd(b, "block-host", { session: friendSession });
      assert.equal(await detail(b, friendSession), null);
      await denied(() =>
        cmd(b, "join", { session: friendSession, platform: "pc" }),
      );
      await role(a);
      assert.equal(
        (await db.query("select count(*)::int n from public.member_blocks"))
          .rows[0].n,
        0,
      );
      await cmd(b, "unblock", { target: a });
      assert.equal(await detail(b, friendSession), null);
      // Phase 9 blocks remove friendship too; unblocking never restores it.
      await admin();
      await db.query(
        "insert into public.friendships(low_id,high_id,requested_by,status) values(least($1::uuid,$2::uuid),greatest($1::uuid,$2::uuid),$1,'accepted')",
        [a, b],
      );
      assert.equal((await detail(b, friendSession)).my_status, "withdrawn");
    },
  );
  await check(
    "host blocks cannot be turned into arbitrary member enumeration or privilege escalation",
    async () => {
      await denied(() =>
        cmd(c, "block-member", { session: friendSession, target: a }),
      );
      await denied(() =>
        cmd(a, "block-member", { session: friendSession, target: d }),
      );
    },
  );
  await check(
    "community bans revoke session reads and group voice eligibility immediately",
    async () => {
      await cmd(b, "join", { session: communitySession, platform: "pc" });
      await admin();
      await db.query(
        "update public.community_members set status='banned' where community_id=$1 and user_id=$2",
        [community, b],
      );
      assert.equal(await detail(b, communitySession), null);
      await denied(() =>
        rpc(b, "voice_admit", { p_channel: communitySession }),
      );
      await cmd(b, "withdraw", { session: communitySession });
    },
  );
  await check(
    "global bans reject public joins and stale-JWT reads",
    async () => {
      await admin();
      await db.query(
        "update auth.users set banned_until=now()+interval '1 day' where id=$1",
        [c],
      );
      assert.equal(await detail(c, friendSession), null);
      await denied(() => make(c));
      await denied(() => rpc(c, "squad_list"));
    },
  );
  await check(
    "filters, cursor ordering and profile activity preferences remain server-authoritative",
    async () => {
      await admin();
      await db.query("update private.squad_config set max_active_per_host=20");
      for (let i = 0; i < 43; i++) {
        const id = randomUUID();
        await db.query(
          "insert into public.gaming_sessions(id,host_id,title,description,game_id,platform_id,cross_play,play_style,max_players,visibility,expires_at) values($1,$2,$3,'Pagination fixture','minecraft','pc',true,'competitive',3,'public',now()+interval '1 hour')",
          [id, d, "Paged " + i],
        );
        await db.query(
          "insert into public.gaming_session_members values($1,$2,'pc','accepted',now(),now())",
          [id, d],
        );
      }
      const first = await rpc(a, "squad_list", { p_style: "competitive" }),
        second = await rpc(a, "squad_list", {
          p_style: "competitive",
          p_before: first.next,
        }),
        third = await rpc(a, "squad_list", {
          p_style: "competitive",
          p_before: second.next,
        });
      assert.equal(first.items.length, 20);
      assert.equal(second.items.length, 20);
      assert.equal(third.items.length, 3);
      assert.equal(
        new Set(
          [...first.items, ...second.items, ...third.items].map((s) => s.id),
        ).size,
        43,
      );
      const page = await rpc(a, "squad_list", {
        p_game: "minecraft",
        p_platform: "xbox",
        p_slots: 1,
      });
      assert.ok(page.items.length > 0);
      assert.ok(
        page.items.every(
          (s) => s.cross_play && s.max_players - s.accepted_count >= 1,
        ),
      );
      await admin();
      await db.query(
        "update public.profiles set visibility='members' where id=$1",
        [d],
      );
      await db.query(
        "update public.user_preferences set show_gaming_activity=true where user_id=$1",
        [d],
      );
      const own = (await rpc(a, "squad_list")).items.find(
        (s) => s.is_host === false && s.host_id === d,
      );
      assert.ok(own);
    },
  );
  await check(
    "committed attempt budgets and service cleanup obey configured rules",
    async () => {
      for (let i = 0; i < 5; i++)
        assert.equal(
          await rpc(a, "squad_budget", { p_operation: "create" }),
          true,
        );
      assert.equal(
        await rpc(a, "squad_budget", { p_operation: "create" }),
        false,
      );
      await admin();
      const r = (await db.query("select public.squad_cleanup() value")).rows[0]
        .value;
      assert.ok(r.expired >= 1);
      assert.equal((await detail(a, open)).state, "expired");
    },
  );
  await check(
    "operator duration, scheduling and active-host caps are enforced",
    async () => {
      await admin();
      await db.query(
        "update private.squad_config set duration_minutes=45,max_schedule_days=2,max_active_per_host=20",
      );
      const starts = new Date(Date.now() + 3600000).toISOString();
      const id = (await make(b, { starts_at: starts })).id;
      assert.equal(
        new Date((await detail(b, id)).expires_at).getTime() -
          new Date(starts).getTime(),
        45 * 60000,
      );
      await denied(
        () =>
          make(b, {
            starts_at: new Date(Date.now() + 3 * 86400000).toISOString(),
          }),
        "22023",
      );
      await admin();
      await db.query("update private.squad_config set max_active_per_host=1");
      await denied(() => make(b), "54000");
    },
  );
  await check(
    "retention purges ended fixtures through a service-only bounded cleanup",
    async () => {
      await admin();
      await db.query("update private.squad_config set retention_days=1");
      await db.query(
        "update public.gaming_sessions set ended_at=now()-interval '2 days' where id=$1",
        [approval],
      );
      const cleaned = (await db.query("select public.squad_cleanup(500) value"))
        .rows[0].value;
      assert.ok(cleaned.deleted >= 1);
      assert.equal(
        (
          await db.query(
            "select count(*)::int n from public.gaming_sessions where id=$1",
            [approval],
          )
        ).rows[0].n,
        0,
      );
    },
  );
  console.log(
    `${checks} Squad Up authorization/database checks passed (rolled back).`,
  );
} finally {
  await db.query("rollback");
  await db.end();
}
