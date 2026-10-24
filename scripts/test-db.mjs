import pg from "pg";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
const connectionString =
  process.env.TEST_DATABASE_URL ||
  (existsSync(".local-stack/database-url")
    ? readFileSync(".local-stack/database-url", "utf8")
    : null) ||
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const db = new pg.Client({ connectionString });
await db.connect();
let count = 0;
const a = randomUUID(),
  b = randomUUID();
const check = async (name, fn) => {
  await fn();
  count++;
  console.log(`PASS ${name}`);
};
async function role(name, id) {
  await db.query("reset role");
  await db.query(`set local role ${name}`);
  await db.query(
    "select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)",
    [id || "", JSON.stringify({ sub: id || undefined, role: name })],
  );
}
async function denied(sql, args = []) {
  await db.query("savepoint denied");
  try {
    await db.query(sql, args);
    throw new Error("Expected database permission denial");
  } catch (error) {
    if (error.code !== "42501") throw error;
  } finally {
    await db.query("rollback to savepoint denied");
    await db.query("release savepoint denied");
  }
}
const save = async (username, visibility = "private", id = a) => {
  await role("authenticated", id);
  return (
    await db.query(
      "select public.save_my_profile($1,'Test member','A private bio',$2,array['co-op'],array['minecraft'],array['pc'],true) as ok",
      [username, visibility],
    )
  ).rows[0].ok;
};
try {
  await db.query("begin");
  await db.query(
    'insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values($1,$3,now(),\'{"date_of_birth":"1990-01-01"}\'),($2,$4,now(),\'{"date_of_birth":"1992-02-02"}\')',
    [a, b, `db-a-${a}@example.test`, `db-b-${b}@example.test`],
  );
  await check(
    "signup trigger creates public profiles and preferences",
    async () => {
      assert.equal(
        (
          await db.query("select visibility from public.profiles where id=$1", [
            a,
          ])
        ).rows[0].visibility,
        "public",
      );
      assert.equal(
        (
          await db.query(
            "select count(*)::int n from public.user_preferences where user_id=any($1::uuid[])",
            [[a, b]],
          )
        ).rows[0].n,
        2,
      );
    },
  );
  await check("direct underage auth insertion is rejected", async () => {
    await db.query("savepoint age");
    try {
      await db.query(
        "insert into auth.users(id,email,raw_user_meta_data) values($1,'underage@example.test',jsonb_build_object('date_of_birth',current_date::text))",
        [randomUUID()],
      );
      assert.fail("Expected rejection");
    } catch (error) {
      assert.match(error.message, /at least 18/);
    } finally {
      await db.query("rollback to savepoint age");
    }
  });
  await check("all user tables and catalogs have RLS enabled", async () => {
    const result = await db.query(
      "select relname,relrowsecurity from pg_class join pg_namespace n on n.oid=relnamespace where n.nspname='public' and relname=any($1)",
      [
        [
          "profiles",
          "user_preferences",
          "user_games",
          "user_platforms",
          "games",
          "platforms",
        ],
      ],
    );
    assert.equal(result.rows.length, 6);
    assert.ok(result.rows.every((r) => r.relrowsecurity));
  });
  await check("authenticated owner completes profile atomically", async () => {
    assert.equal(await save(`member_a_${a.slice(0, 8)}`), true);
  });
  await check("second account cannot claim an existing username", async () => {
    assert.equal(await save(`member_a_${a.slice(0, 8)}`, "private", b), false);
  });
  await check(
    "invalid games cannot partially overwrite a profile",
    async () => {
      await role("authenticated", a);
      const before = (
        await db.query("select username from public.profiles where id=$1", [a])
      ).rows[0].username;
      const result = await db.query(
        "select public.save_my_profile('changed_name','Bad','', 'public',array['co-op'],array['not-a-game'],array['pc'],true) ok",
      );
      assert.equal(result.rows[0].ok, false);
      assert.equal(
        (
          await db.query("select username from public.profiles where id=$1", [
            a,
          ])
        ).rows[0].username,
        before,
      );
    },
  );
  await check(
    "owner can only read their own profile/preferences/favorites",
    async () => {
      await role("authenticated", b);
      for (const table of [
        "profiles",
        "user_preferences",
        "user_games",
        "user_platforms",
      ]) {
        const col = table === "profiles" ? "id" : "user_id";
        assert.equal(
          (
            await db.query(
              `select count(*)::int n from public.${table} where ${col}=$1`,
              [a],
            )
          ).rows[0].n,
          0,
        );
      }
    },
  );
  await check(
    "direct profile identity writes and preference writes are denied",
    async () => {
      await denied("update public.profiles set id=$1 where id=$2", [a, b]);
      await denied(
        "update public.user_preferences set interests=$1 where user_id=$2",
        [["faith"], a],
      );
      await denied(
        "insert into public.user_games(user_id,game_id) values($1,'valorant')",
        [a],
      );
    },
  );
  await check(
    "private profile lookup and avatar lookup do not reveal an account",
    async () => {
      assert.equal(
        (
          await db.query("select * from public.visible_profile($1)", [
            `member_a_${a.slice(0, 8)}`,
          ])
        ).rows.length,
        0,
      );
      assert.equal(
        (await db.query("select public.visible_avatar($1) path", [a])).rows[0]
          .path,
        null,
      );
    },
  );
  await check(
    "anonymous callers cannot enumerate user tables or call mutation RPCs",
    async () => {
      await role("anon");
      for (const table of [
        "profiles",
        "user_preferences",
        "user_games",
        "user_platforms",
      ])
        await denied(`select * from public.${table}`);
      await denied("select public.save_my_preferences(true,true)");
      await denied("select public.consume_auth_rate_limit(repeat('a',64))");
    },
  );
  await check(
    "members-only profiles stay unavailable to anonymous callers",
    async () => {
      assert.equal(await save(`member_a_${a.slice(0, 8)}`, "members"), true);
      await role("anon");
      assert.equal(
        (
          await db.query("select * from public.visible_profile($1)", [
            `member_a_${a.slice(0, 8)}`,
          ])
        ).rows.length,
        0,
      );
      await role("authenticated", b);
      assert.equal(
        (
          await db.query("select * from public.visible_profile($1)", [
            `member_a_${a.slice(0, 8)}`,
          ])
        ).rows.length,
        1,
      );
    },
  );
  await check(
    "a stale JWT for a nonexistent identity cannot view member-only profiles",
    async () => {
      await role("authenticated", randomUUID());
      assert.equal(
        (
          await db.query("select * from public.visible_profile($1)", [
            `member_a_${a.slice(0, 8)}`,
          ])
        ).rows.length,
        0,
      );
    },
  );
  await check(
    "explicit public projection omits restricted fields",
    async () => {
      assert.equal(await save(`member_a_${a.slice(0, 8)}`, "public"), true);
      await role("anon");
      const result = (
        await db.query("select * from public.visible_profile($1)", [
          `member_a_${a.slice(0, 8)}`,
        ])
      ).rows[0];
      assert.equal(result.username, `member_a_${a.slice(0, 8)}`);
      for (const field of [
        "email",
        "date_of_birth",
        "interests",
        "event_reminders",
        "avatar_path",
        "created_at",
        "raw_user_meta_data",
      ])
        assert.equal(field in result, false);
      assert.deepEqual(result.favorite_games, ["Minecraft"]);
    },
  );
  await check(
    "private-schema age evidence cannot be read or altered",
    async () => {
      await role("authenticated", a);
      await denied("select * from private.account_security");
      await denied(
        "update private.account_security set date_of_birth='1990-01-01'",
      );
    },
  );
  await check(
    "changing user metadata cannot change stored age eligibility",
    async () => {
      await role("postgres");
      await db.query(
        'update auth.users set raw_user_meta_data=\'{"date_of_birth":"2020-01-01","role":"admin"}\' where id=$1',
        [a],
      );
      assert.equal(
        (
          await db.query(
            "select date_of_birth::text dob from private.account_security where user_id=$1",
            [a],
          )
        ).rows[0].dob,
        "1990-01-01",
      );
    },
  );
  await check(
    "avatar bucket is private and direct authenticated uploads are denied",
    async () => {
      await role("postgres");
      assert.equal(
        (
          await db.query(
            "select public from storage.buckets where id='avatars'",
          )
        ).rows[0].public,
        false,
      );
      await role("authenticated", b);
      await denied(
        "insert into storage.objects(bucket_id,name) values('avatars',$1)",
        [`${b}/${randomUUID()}.webp`],
      );
    },
  );
  await check(
    "avatar pointer rejects another user folder and nonexistent files",
    async () => {
      assert.equal(
        (
          await db.query("select public.set_my_avatar($1) ok", [
            `${a}/${randomUUID()}.webp`,
          ])
        ).rows[0].ok,
        false,
      );
      assert.equal(
        (
          await db.query("select public.set_my_avatar($1) ok", [
            `${b}/${randomUUID()}.webp`,
          ])
        ).rows[0].ok,
        false,
      );
    },
  );
  await check(
    "avatar restrictions survive a broad unrelated permissive storage policy",
    async () => {
      await role("postgres");
      await db.query(
        "create policy gathering_test_broad_storage on storage.objects for all to authenticated using (true) with check (true); grant insert on storage.objects to authenticated",
      );
      await role("authenticated", b);
      await denied(
        "insert into storage.objects(bucket_id,name) values('avatars',$1)",
        [`${b}/${randomUUID()}.webp`],
      );
      await role("postgres");
      await db.query(
        "drop policy gathering_test_broad_storage on storage.objects",
      );
    },
  );
  await check("preferences RPC cannot target another user", async () => {
    await role("authenticated", b);
    assert.equal(
      (await db.query("select public.save_my_preferences(true,true) ok"))
        .rows[0].ok,
      true,
    );
    await role("postgres");
    assert.equal(
      (
        await db.query(
          "select event_reminders from public.user_preferences where user_id=$1",
          [a],
        )
      ).rows[0].event_reminders,
      false,
    );
  });
  await check(
    "username collision attempts consume a persistent rate-limit budget",
    async () => {
      await role("postgres");
      await db.query("delete from private.rate_limits where key=$1", [
        `profile:${b}`,
      ]);
      for (let i = 0; i < 12; i++)
        assert.equal(
          await save(`member_a_${a.slice(0, 8)}`, "private", b),
          false,
        );
      assert.equal(await save(`unique_${b.slice(0, 8)}`, "private", b), false);
    },
  );
  await check(
    "deleting auth identity cascades all application user rows",
    async () => {
      await role("postgres");
      await db.query("delete from auth.users where id=$1", [a]);
      for (const [schema, table, col] of [
        ["public", "profiles", "id"],
        ["public", "user_preferences", "user_id"],
        ["public", "user_games", "user_id"],
        ["public", "user_platforms", "user_id"],
        ["private", "account_security", "user_id"],
      ])
        assert.equal(
          (
            await db.query(
              `select count(*)::int n from ${schema}.${table} where ${col}=$1`,
              [a],
            )
          ).rows[0].n,
          0,
        );
    },
  );
  console.log(
    `${count} database access-control tests passed (transaction rolled back).`,
  );
} finally {
  await db.query("rollback");
  await db.end();
}
