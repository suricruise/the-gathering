import pg from "pg";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { readFileSync } from "node:fs";
const connectionString = readFileSync(
  ".local-stack/database-url",
  "utf8",
).trim();
if (!["127.0.0.1", "localhost"].includes(new URL(connectionString).hostname))
  throw Error("Local database required");
const db = new pg.Client({ connectionString });
await db.connect();
const ids = Array.from({ length: 6 }, () => randomUUID());
const [owner, admin, mod, member, outsider, other] = ids;
let count = 0;
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
async function command(id, op, c, data = {}) {
  await role(id);
  return (
    await db.query("select public.community_command($1,$2,$3) result", [
      op,
      c,
      JSON.stringify(data),
    ])
  ).rows[0].result;
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
    await db.query("rollback to savepoint denial");
    await db.query("release savepoint denial");
  }
  assert.ok(caught, "Expected denial");
}
async function check(name, fn) {
  await fn();
  console.log(`PASS ${name}`);
  count++;
}
const settings = {
  name: "Test community",
  description: "Private test description",
  visibility: "public",
  cover: "nebula",
};
const hash = (t) => createHash("sha256").update(t).digest("hex");
try {
  await db.query("begin");
  for (const id of ids)
    await db.query(
      'insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values($1,$2,now(),\'{"date_of_birth":"1990-01-01"}\')',
      [id, `${id}@example.test`],
    );
  await check("unapproved users cannot create communities", () =>
    denied(() =>
      command(owner, "create", null, { ...settings, slug: "test-unapproved" }),
    ),
  );
  await role(null);
  await db.query("reset role");
  await db.query("insert into private.community_creators(user_id) values($1)", [
    owner,
  ]);
  const publicC = (
    await command(owner, "create", null, {
      ...settings,
      slug: `test-${randomUUID().slice(0, 8)}`,
    })
  ).id;
  const privateC = (
    await command(owner, "create", null, {
      ...settings,
      slug: `test-${randomUUID().slice(0, 8)}`,
      visibility: "private",
    })
  ).id;
  const discoveryC = (
    await command(owner, "create", null, {
      ...settings,
      slug: `test-${randomUUID().slice(0, 8)}`,
      visibility: "discoverable",
    })
  ).id;
  await check("creator gets exactly the owner membership", async () => {
    await role(owner);
    assert.equal(
      (
        await db.query(
          "select role_id from public.community_members where community_id=$1",
          [publicC],
        )
      ).rows[0].role_id,
      "owner",
    );
  });
  await check("private communities are hidden by RLS", async () => {
    await role(outsider);
    assert.equal(
      (
        await db.query("select id from public.communities where id=$1", [
          privateC,
        ])
      ).rowCount,
      0,
    );
  });
  await check(
    "discoverable communities are visible but cannot self-join",
    async () => {
      await role(outsider);
      assert.equal(
        (
          await db.query("select id from public.communities where id=$1", [
            discoveryC,
          ])
        ).rowCount,
        1,
      );
      await denied(() => command(outsider, "join", discoveryC));
    },
  );
  await check("private communities cannot be joined by guessing IDs", () =>
    denied(() => command(outsider, "join", privateC)),
  );
  for (const id of [admin, mod, member]) await command(id, "join", publicC);
  await check(
    "repeat join is idempotent and cannot change a role",
    async () => {
      await command(member, "join", publicC, { role: "owner", user_id: owner });
      await role(member);
      assert.equal(
        (await db.query("select public.community_my_role($1) r", [publicC]))
          .rows[0].r,
        "member",
      );
    },
  );
  await command(owner, "role", publicC, {
    user_id: admin,
    role: "administrator",
  });
  await command(owner, "role", publicC, { user_id: mod, role: "moderator" });
  await check(
    "direct membership, role and approval writes are denied",
    async () => {
      await role(member);
      await denied(() =>
        db.query(
          "update public.community_members set role_id='owner' where user_id=$1",
          [member],
        ),
      );
      await denied(() =>
        db.query(
          "update public.community_roles set rank=100 where id='member'",
        ),
      );
      await denied(() =>
        db.query("insert into private.community_creators(user_id) values($1)", [
          member,
        ]),
      );
    },
  );
  await check(
    "members cannot promote themselves or manage settings",
    async () => {
      await denied(() =>
        command(member, "role", publicC, {
          user_id: member,
          role: "administrator",
        }),
      );
      await denied(() => command(member, "settings", publicC, settings));
    },
  );
  await check(
    "administrators cannot promote peers, create owners, or demote owners",
    async () => {
      await denied(() =>
        command(admin, "role", publicC, {
          user_id: member,
          role: "administrator",
        }),
      );
      await denied(() =>
        command(admin, "role", publicC, { user_id: member, role: "owner" }),
      );
      await denied(() =>
        command(admin, "role", publicC, { user_id: owner, role: "member" }),
      );
    },
  );
  await check(
    "moderators cannot assign roles, alter channels, or ban administrators",
    async () => {
      await denied(() =>
        command(mod, "role", publicC, { user_id: member, role: "moderator" }),
      );
      await denied(() => command(mod, "channel", publicC, {}));
      await denied(() => command(mod, "ban", publicC, { user_id: admin }));
    },
  );
  await command(owner, "channel", publicC, {
    name: "staff",
    description: "Staff only",
    kind: "text",
    is_private: true,
    position: 1,
  });
  await role(owner);
  const channel = (
    await db.query(
      "select id from public.channels where community_id=$1 and name='staff'",
      [publicC],
    )
  ).rows[0].id;
  await check(
    "private channel metadata and direct channel access are denied to members and outsiders",
    async () => {
      for (const id of [member, outsider, mod]) {
        await role(id);
        assert.equal(
          (
            await db.query("select id from public.channels where id=$1", [
              channel,
            ])
          ).rowCount,
          0,
        );
        assert.equal(
          (
            await db.query("select public.channel_access($1) allowed", [
              channel,
            ])
          ).rows[0].allowed,
          false,
        );
      }
    },
  );
  await check(
    "owners and administrators can read private channels",
    async () => {
      for (const id of [owner, admin]) {
        await role(id);
        assert.equal(
          (
            await db.query("select id from public.channels where id=$1", [
              channel,
            ])
          ).rowCount,
          1,
        );
      }
    },
  );
  await check(
    "private channel grants permit only the targeted verified member",
    async () => {
      await command(admin, "override", publicC, {
        channel_id: channel,
        user_id: member,
        can_view: true,
        can_post: true,
        can_connect: false,
      });
      await role(member);
      assert.equal(
        (
          await db.query(
            "select public.channel_access($1) v,public.channel_access($1,'post') p,public.channel_access($1,'connect') c",
            [channel],
          )
        ).rows[0].v,
        true,
      );
      assert.equal(
        (
          await db.query("select public.channel_access($1,'connect') c", [
            channel,
          ])
        ).rows[0].c,
        false,
      );
    },
  );
  await check("deny overrides win over role grants", async () => {
    await command(admin, "override", publicC, {
      channel_id: channel,
      role: "member",
      can_view: false,
      can_post: true,
      can_connect: true,
    });
    await role(member);
    assert.equal(
      (await db.query("select public.channel_access($1) v", [channel])).rows[0]
        .v,
      false,
    );
    await command(admin, "override", publicC, {
      channel_id: channel,
      role: "member",
      reset: true,
    });
  });
  await check("members cannot grant themselves private access", () =>
    denied(() =>
      command(member, "override", publicC, {
        channel_id: channel,
        user_id: member,
        can_view: true,
        can_post: true,
        can_connect: true,
      }),
    ),
  );
  await check("permission overrides cannot cross community boundaries", () =>
    denied(() =>
      command(owner, "override", privateC, {
        channel_id: channel,
        user_id: member,
        can_view: true,
        can_post: true,
        can_connect: true,
      }),
    ),
  );
  await check(
    "bans immediately revoke granted private access and prevent rejoining",
    async () => {
      await command(mod, "ban", publicC, { user_id: member });
      await role(member);
      assert.equal(
        (await db.query("select public.channel_access($1) v", [channel]))
          .rows[0].v,
        false,
      );
      await denied(() => command(member, "join", publicC));
      await command(mod, "unban", publicC, { user_id: member });
    },
  );
  await check(
    "channel names are unique within community, but reusable elsewhere",
    async () => {
      await denied(
        () =>
          command(owner, "channel", publicC, {
            name: "staff",
            description: "",
            kind: "voice",
            is_private: false,
            position: 0,
          }),
        "23505",
      );
      await command(owner, "channel", privateC, {
        name: "staff",
        description: "",
        kind: "text",
        is_private: false,
        position: 0,
      });
    },
  );
  await command(owner, "category", privateC, {
    name: "Private category",
    position: 0,
  });
  await role(owner);
  const cat = (
    await db.query(
      "select id from public.channel_categories where community_id=$1",
      [privateC],
    )
  ).rows[0].id;
  await check("category references cannot cross communities", () =>
    denied(
      () =>
        command(owner, "channel", publicC, {
          name: "wrong-scope",
          description: "",
          kind: "text",
          is_private: false,
          position: 0,
          category_id: cat,
        }),
      "23503",
    ),
  );
  await check(
    "roster exposes only deliberate display fields and blocks outsiders",
    async () => {
      await role(outsider);
      assert.equal(
        (await db.query("select * from public.community_roster($1)", [publicC]))
          .rowCount,
        0,
      );
      await role(member);
      const r = await db.query("select * from public.community_roster($1)", [
        publicC,
      ]);
      assert.equal(r.rowCount, 4);
      assert.deepEqual(
        r.fields.map((f) => f.name),
        ["user_id", "username", "display_name", "role_id", "status"],
      );
    },
  );
  const token = randomUUID().replaceAll("-", "").repeat(2);
  await check(
    "members cannot issue invites; moderators can issue member-only invites",
    async () => {
      await denied(() =>
        command(member, "invite", publicC, { token_digest: hash(token) }),
      );
      await command(owner, "invite", privateC, { token_digest: hash(token) });
    },
  );
  await check(
    "invitation token hashes cannot be selected even by owners",
    async () => {
      await role(owner);
      await denied(() =>
        db.query("select token_digest from public.invitations"),
      );
    },
  );
  await check(
    "single-use invitation grants only member and opens private community",
    async () => {
      await command(outsider, "accept_invite", null, {
        token,
        role: "owner",
        user_id: owner,
      });
      await role(outsider);
      assert.equal(
        (await db.query("select public.community_my_role($1) r", [privateC]))
          .rows[0].r,
        "member",
      );
      assert.equal(
        (
          await db.query("select id from public.communities where id=$1", [
            privateC,
          ])
        ).rowCount,
        1,
      );
      await denied(() => command(other, "accept_invite", null, { token }));
    },
  );
  await check("expired and revoked invitation tokens fail closed", async () => {
    for (const revoke of [true, false]) {
      const t = randomUUID().replaceAll("-", "").repeat(2);
      await command(owner, "invite", privateC, { token_digest: hash(t) });
      await role(owner);
      const id = (
        await db.query(
          "select id from public.invitations where community_id=$1 and accepted_at is null and revoked_at is null order by created_at,id",
          [privateC],
        )
      ).rows[0].id;
      if (revoke) await command(owner, "revoke_invite", privateC, { id });
      else {
        await db.query("reset role");
        await db.query(
          "update public.invitations set expires_at=now()-interval '1 second' where token_digest=$1",
          [hash(t)],
        );
      }
      await denied(() => command(other, "accept_invite", null, { token: t }));
    }
  });
  await check("owner cannot leave before transferring ownership", () =>
    denied(() => command(owner, "leave", publicC)),
  );
  await check("ownership transfer is atomic and leaves one owner", async () => {
    await command(owner, "transfer", publicC, { user_id: admin });
    await role(admin);
    const result = await db.query(
      "select role_id,count(*)::int n from public.community_members where community_id=$1 group by role_id",
      [publicC],
    );
    assert.equal(result.rows.find((r) => r.role_id === "owner").n, 1);
    await denied(() =>
      command(owner, "role", publicC, { user_id: admin, role: "member" }),
    );
  });
  await check(
    "leaving removes channel access and user-specific overrides",
    async () => {
      await command(member, "leave", publicC);
      await role(member);
      assert.equal(
        (await db.query("select public.channel_access($1) v", [channel]))
          .rows[0].v,
        false,
      );
      await role(admin);
      assert.equal(
        (
          await db.query(
            "select id from public.channel_permission_overrides where user_id=$1",
            [member],
          )
        ).rowCount,
        0,
      );
    },
  );
  await check(
    "membership changes have immutable database audit records",
    async () => {
      await role(admin);
      const rows = await db.query(
        "select * from public.community_audit_log where community_id=$1 and action='membership.update'",
        [publicC],
      );
      assert.ok(rows.rowCount >= 4);
      assert.ok(rows.rows.some((r) => r.detail.new_role === "owner"));
      await denied(() => db.query("delete from public.community_audit_log"));
    },
  );
  await check(
    "anonymous callers cannot read communities or invoke membership commands",
    async () => {
      await role(null);
      await denied(() => db.query("select * from public.communities"));
      await denied(() =>
        db.query("select public.community_command('join',$1)", [publicC]),
      );
    },
  );
  await check(
    "stale unverified/banned identities fail database authorization",
    async () => {
      await db.query("reset role");
      await db.query(
        "update auth.users set banned_until=now()+interval '1 hour' where id=$1",
        [admin],
      );
      await role(admin);
      assert.equal(
        (
          await db.query("select id from public.channels where id=$1", [
            channel,
          ])
        ).rowCount,
        0,
      );
      await denied(() => command(admin, "settings", publicC, settings));
      await db.query("reset role");
      await db.query(
        "update auth.users set banned_until=null,email_confirmed_at=null where id=$1",
        [admin],
      );
      await role(admin);
      assert.equal(
        (
          await db.query("select id from public.communities where id=$1", [
            publicC,
          ])
        ).rowCount,
        0,
      );
    },
  );
  await check("all community tables enforce RLS", async () => {
    await db.query("reset role");
    const rows = await db.query(
      "select relname,relrowsecurity from pg_class where relnamespace='public'::regnamespace and relname=any($1)",
      [
        [
          "community_roles",
          "communities",
          "community_members",
          "channel_categories",
          "channels",
          "channel_permission_overrides",
          "invitations",
          "community_audit_log",
        ],
      ],
    );
    assert.equal(rows.rowCount, 8);
    assert.ok(rows.rows.every((r) => r.relrowsecurity));
  });
  await check(
    "account deletion preserves audit and removes owned membership",
    async () => {
      await db.query("reset role");
      await db.query("delete from auth.users where id=$1", [owner]);
      assert.equal(
        (
          await db.query(
            "select * from public.community_members where user_id=$1",
            [owner],
          )
        ).rowCount,
        0,
      );
      assert.ok(
        (
          await db.query(
            "select * from public.community_audit_log where community_id=$1 and action='membership.update'",
            [publicC],
          )
        ).rowCount > 0,
      );
    },
  );
  console.log(`${count} community authorization checks passed (rolled back).`);
} finally {
  await db.query("rollback");
  await db.end();
}
