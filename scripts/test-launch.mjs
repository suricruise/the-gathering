import pg from "pg";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
const connectionString = readFileSync(
  ".local-stack/database-url",
  "utf8",
).trim();
if (!["localhost", "127.0.0.1"].includes(new URL(connectionString).hostname))
  throw Error("Local only");
const d = new pg.Client({ connectionString });
await d.connect();
let n = 0;
async function check(name, fn) {
  await fn();
  console.log("PASS " + name);
  n++;
}
const a = randomUUID(),
  b = randomUUID(),
  c = randomUUID();
async function as(u) {
  await d.query("reset role");
  await d.query("set local role authenticated");
  await d.query(
    "select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)",
    [u, JSON.stringify({ sub: u, role: "authenticated" })],
  );
}
async function denied(fn) {
  await d.query("savepoint denied");
  await assert.rejects(fn, (e) => e.code === "42501");
  await d.query("rollback to savepoint denied");
}
try {
  await d.query("begin");
  for (const id of [a, b]) {
    await d.query(
      `insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values($1,$2,now(),'{"date_of_birth":"1990-01-01"}')`,
      [id, id + "@example.test"],
    );
    await d.query(
      "update public.profiles set username=$2,onboarding_completed_at=now() where id=$1",
      [id, "launch_" + id.slice(0, 8)],
    );
  }
  await d.query(
    "insert into public.communities(id,slug,name) values($1,$2,'Launch test')",
    [c, "launch-" + c.slice(0, 8)],
  );
  await d.query(
    "insert into public.community_members(community_id,user_id,role_id) values($1,$2,'owner'),($1,$3,'member')",
    [c, a, b],
  );
  await check("all application data tables enable RLS", async () => {
    assert.equal(
      (
        await d.query(
          "select count(*)::int n from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private') and c.relkind='r' and not c.relrowsecurity",
        )
      ).rows[0].n,
      0,
    );
  });
  await check(
    "anonymous execute rights allow only explicit public profile/avatar projections",
    async () => {
      const names = (
        await d.query(
          "select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.prosecdef and n.nspname in ('public','private') and has_function_privilege('anon',p.oid,'execute') order by p.proname",
        )
      ).rows.map((r) => r.proname);
      assert.deepEqual(names, ["visible_avatar", "visible_profile"]);
    },
  );
  await check("all media buckets are private", async () => {
    assert.equal(
      (
        await d.query(
          "select count(*)::int n from storage.buckets where id in ('avatars','message-files','social-media') and not public",
        )
      ).rows[0].n,
      3,
    );
  });
  await check(
    "community ownership blocks deletion at the direct database boundary",
    async () => {
      await as(a);
      assert.equal(
        (await d.query("select public.account_deletion_ready() ok")).rows[0].ok,
        false,
      );
      await d.query("reset role");
      await denied(() => d.query("delete from auth.users where id=$1", [a]));
    },
  );
  await check(
    "platform ownership also blocks direct Auth Admin-style deletion",
    async () => {
      await d.query(
        "insert into private.platform_roles(user_id,role) values($1,'owner')",
        [b],
      );
      await denied(() => d.query("delete from auth.users where id=$1", [b]));
      await d.query("delete from private.platform_roles where user_id=$1", [b]);
    },
  );
  await check(
    "a standard member can delete only their own eligible account",
    async () => {
      await as(b);
      assert.equal(
        (await d.query("select public.account_deletion_ready() ok")).rows[0].ok,
        true,
      );
      await denied(() => d.query("select public.operational_health()"));
      await d.query("reset role");
      await d.query("delete from auth.users where id=$1", [b]);
    },
  );
  await check(
    "operational data and completion reports are service-only",
    async () => {
      await as(a);
      await denied(() => d.query("select * from private.operational_runs"));
      await denied(() =>
        d.query("select public.record_operational_run('chat_cleanup')"),
      );
      await d.query("reset role");
      const r = (await d.query("select public.operational_health() ok")).rows[0]
        .ok;
      assert.equal(r.rls, true);
      assert.equal(r.storage, true);
      assert.equal(r.migration, true);
    },
  );
  await check(
    "owner transfer then deletion preserves a managed community",
    async () => {
      const successor = randomUUID();
      await d.query(
        `insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values($1,$2,now(),'{"date_of_birth":"1990-01-01"}')`,
        [successor, successor + "@example.test"],
      );
      await d.query(
        "insert into public.community_members(community_id,user_id) values($1,$2)",
        [c, successor],
      );
      await as(a);
      await d.query("select public.community_command('transfer',$1,$2)", [
        c,
        { user_id: successor },
      ]);
      await as(a);
      assert.equal(
        (await d.query("select public.account_deletion_ready() ok")).rows[0].ok,
        true,
      );
      await d.query("reset role");
      await d.query("delete from auth.users where id=$1", [a]);
      assert.equal(
        (
          await d.query(
            "select user_id from public.community_members where community_id=$1 and role_id='owner'",
            [c],
          )
        ).rows[0].user_id,
        successor,
      );
    },
  );
  await check(
    "message history uses its pagination index under representative data",
    async () => {
      const u = randomUUID();
      await d.query(
        `insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values($1,$2,now(),'{"date_of_birth":"1990-01-01"}')`,
        [u, u + "@example.test"],
      );
      const ch = randomUUID();
      await d.query(
        "insert into public.channels(id,community_id,name) values($1,$2,'history')",
        [ch, c],
      );
      await d.query(
        "insert into public.messages(id,channel_id,author_id,body) select gen_random_uuid(),$1,$2,'Benchmark fixture' from generate_series(1,5000)",
        [ch, u],
      );
      await d.query("analyze public.messages");
      const plan = (
        await d.query(
          "explain (format json) select id,body from public.messages where channel_id=$1 and parent_id is null order by created_seq desc limit 50",
          [ch],
        )
      ).rows[0]["QUERY PLAN"];
      assert.match(JSON.stringify(plan), /messages_root_page/);
    },
  );
  console.log(
    `${n} launch security/operational checks passed; all fixtures rolled back.`,
  );
} finally {
  await d.query("reset role");
  await d.query("rollback");
  await d.end();
}
