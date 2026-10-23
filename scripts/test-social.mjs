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
const [a, b, c, d] = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
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
  await admin();
  await db.query("delete from private.social_budgets");
}

try {
  await db.query("begin");
  for (const id of [a, b, c, d])
    await db.query(
      `insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values($1,$2,now(),'{"date_of_birth":"1990-01-01"}')`,
      [id, `${id}@example.test`],
    );
  const community = randomUUID();
  await db.query(
    "insert into public.communities(id,slug,name,visibility) values($1,$2,'Private social','private')",
    [community, `social-${community.slice(0, 8)}`],
  );
  await db.query(
    "insert into public.community_members(community_id,user_id,role_id) values($1,$2,'owner'),($1,$3,'member'),($1,$4,'moderator')",
    [community, a, b, d],
  );
  const create = (actor, extra = {}) =>
    rpc(actor, "social_command", {
      p_operation: "create",
      p_data: {
        id: randomUUID(),
        body: "A real shared moment",
        audience: "members",
        community: null,
        games: ["minecraft"],
        interests: ["co-op"],
        media: [],
        ...extra,
      },
    });
  const cmd = (actor, operation, data) =>
    rpc(actor, "social_command", { p_operation: operation, p_data: data });
  const get = (actor, id) => rpc(actor, "social_post", { p_id: id });
  const feed = (actor, extra = {}) =>
    rpc(actor, "social_feed", { p_mode: "explore", ...extra });
  let shared, privatePost, communityPost, followersPost, comment;
  await check(
    "all ten social user and operational tables enable RLS",
    async () => {
      await admin();
      assert.equal(
        (
          await db.query(
            "select count(*)::int n from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relrowsecurity and ((n.nspname='public' and c.relname in ('posts','post_media','post_reactions','post_comments','follows','post_reports','post_link_previews')) or (n.nspname='private' and c.relname in ('social_moderators','social_budgets','social_audit')))",
          )
        ).rows[0].n,
        10,
      );
    },
  );
  await check(
    "authenticated author and catalog tags are server derived",
    async () => {
      shared = (await create(b, { author_id: a })).id;
      const p = await get(b, shared);
      assert.equal(p.author_id, b);
      assert.deepEqual(p.game_tags, ["minecraft"]);
      assert.equal(p.body, "A real shared moment");
    },
  );
  await check(
    "anonymous and stale identities cannot read or create posts",
    async () => {
      await denied(() => create(null));
      await denied(() => get(null, shared));
      await denied(() => create(randomUUID()));
    },
  );
  await check(
    "private community posts never enter outsider feeds or direct reads",
    async () => {
      communityPost = (await create(b, { audience: "community", community }))
        .id;
      assert.equal(await get(c, communityPost), null);
      assert.equal(
        (await feed(c)).items.some((p) => p.id === communityPost),
        false,
      );
      assert.ok(await get(a, communityPost));
      await role(c);
      assert.equal(
        (
          await db.query(
            "select count(*)::int n from public.posts where id=$1",
            [communityPost],
          )
        ).rows[0].n,
        0,
      );
    },
  );
  await check("private audience remains author-only", async () => {
    privatePost = (await create(b, { audience: "private" })).id;
    assert.equal(await get(a, privatePost), null);
    assert.equal(await get(c, privatePost), null);
    assert.ok(await get(b, privatePost));
  });
  await check(
    "audience cannot relabel private community content as member-wide",
    async () => {
      await denied(
        () => create(b, { community, audience: "members" }),
        "22023",
      );
      await denied(() => create(c, { community, audience: "community" }));
    },
  );
  await check(
    "followers audience follows live relationship and can be unfollowed",
    async () => {
      followersPost = (await create(b, { audience: "followers" })).id;
      assert.equal(await get(c, followersPost), null);
      await cmd(c, "follow", { target: b, active: true });
      assert.ok(await get(c, followersPost));
      await cmd(c, "follow", { target: b, active: false });
      assert.equal(await get(c, followersPost), null);
    },
  );
  await check("follows graph is private to the following account", async () => {
    await cmd(c, "follow", { target: b, active: true });
    await role(a);
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from public.follows where follower_id=$1",
          [c],
        )
      ).rows[0].n,
      0,
    );
    await denied(() => cmd(c, "follow", { target: c, active: true }));
  });
  await check(
    "personalization uses follows, communities, interests and games without bypassing audiences",
    async () => {
      const p = await rpc(c, "social_feed", { p_mode: "for-you" });
      assert.ok(p.items.some((x) => x.id === shared));
      assert.equal(
        p.items.some((x) => x.id === communityPost || x.id === privatePost),
        false,
      );
      assert.ok(
        (await rpc(b, "social_feed", { p_mode: "mine" })).items.every(
          (x) => x.author_id === b,
        ),
      );
    },
  );
  await check(
    "stable post IDs retry one record and cannot be claimed by another author",
    async () => {
      const id = randomUUID();
      await create(b, { id });
      await create(b, { id, body: "retry" });
      assert.equal((await get(b, id)).body, "A real shared moment");
      await denied(() => create(c, { id }));
    },
  );
  await check("owned edits and deletions reject another account", async () => {
    await denied(() => cmd(c, "edit", { post: shared, body: "stolen" }));
    await denied(() => cmd(c, "delete", { post: shared }));
    await cmd(b, "edit", { post: shared, body: "Updated real post" });
    assert.equal((await get(c, shared)).body, "Updated real post");
  });
  await check(
    "reaction mutations are idempotent and isolated by actor",
    async () => {
      await cmd(c, "react", { post: shared, emoji: "👍", active: true });
      await cmd(c, "react", { post: shared, emoji: "👍", active: true });
      assert.equal((await get(b, shared)).reactions[0].count, 1);
      await cmd(b, "react", { post: shared, emoji: "👍", active: false });
      assert.equal((await get(b, shared)).reactions[0].count, 1);
      await cmd(c, "react", { post: shared, emoji: "👍", active: false });
      assert.equal((await get(b, shared)).reactions.length, 0);
      await denied(() =>
        cmd(c, "react", { post: communityPost, emoji: "👍", active: true }),
      );
    },
  );
  await check(
    "comments edit and delete only by their verified author",
    async () => {
      comment = randomUUID();
      await cmd(c, "comment", {
        id: comment,
        post: shared,
        body: "A real comment",
      });
      await cmd(c, "comment", { id: comment, post: shared, body: "retry" });
      assert.equal(
        (await rpc(b, "social_comments", { p_post: shared })).items.length,
        1,
      );
      await denied(() =>
        cmd(b, "edit-comment", { post: shared, comment, body: "stolen" }),
      );
      await denied(() => cmd(b, "delete-comment", { post: shared, comment }));
      await cmd(c, "edit-comment", {
        post: shared,
        comment,
        body: "Edited comment",
      });
      assert.equal(
        (await rpc(b, "social_comments", { p_post: shared })).items[0].body,
        "Edited comment",
      );
    },
  );
  await check(
    "community staff cannot moderate platform posts without approval",
    async () => {
      await cmd(c, "report", {
        post: shared,
        reason: "spam",
        detail: "Check this",
      });
      await role(c);
      const report = (
        await db.query("select id from public.post_reports where post_id=$1", [
          shared,
        ])
      ).rows[0].id;
      await denied(() => cmd(a, "moderate", { report, decision: "hide" }));
      assert.equal((await rpc(a, "social_report_page", {})).items.length, 0);
    },
  );
  await check(
    "report details and status are private; reporters cannot assign moderation roles",
    async () => {
      await role(b);
      assert.equal(
        (
          await db.query(
            "select count(*)::int n from public.post_reports where post_id=$1",
            [shared],
          )
        ).rows[0].n,
        0,
      );
      await denied(async () => {
        await role(c);
        await db.query("insert into private.social_moderators values($1)", [c]);
      });
    },
  );
  await check(
    "approved platform moderator can triage reports with audit",
    async () => {
      await admin();
      await db.query("insert into private.social_moderators values($1)", [a]);
      const q = await rpc(a, "social_report_page", {});
      const report = q.items.find((r) => r.post_id === shared);
      assert.ok(report);
      await cmd(a, "moderate", { report: report.id, decision: "hide" });
      assert.equal(await get(c, shared), null);
      assert.equal((await get(b, shared)).status, "hidden");
      assert.equal(
        (await rpc(c, "social_report_page", { p_mine: true })).items[0].status,
        "actioned",
      );
      await admin();
      assert.ok(
        (
          await db.query(
            "select count(*)::int n from private.social_audit where post_id=$1",
            [shared],
          )
        ).rows[0].n > 0,
      );
      await cmd(a, "moderate", { report: report.id, decision: "restore" });
    },
  );
  await check(
    "comment reports retain privacy and removal cannot be reversed",
    async () => {
      await cmd(b, "report", {
        post: shared,
        comment,
        reason: "spam",
        detail: "Comment review",
      });
      const report = (await rpc(a, "social_report_page", {})).items.find(
        (r) => r.comment_id === comment,
      );
      assert.ok(report);
      await cmd(a, "moderate", { report: report.id, decision: "remove" });
      await denied(
        () => cmd(a, "moderate", { report: report.id, decision: "restore" }),
        "22023",
      );
      await denied(
        () => cmd(a, "moderate", { report: report.id, decision: "hide" }),
        "22023",
      );
      await admin();
      const row = (
        await db.query(
          "select body,status from public.post_comments where id=$1",
          [comment],
        )
      ).rows[0];
      assert.equal(row.body, "");
      assert.equal(row.status, "removed");
      await role(d);
      assert.equal(
        (
          await db.query(
            "select count(*)::int n from public.post_reports where comment_id=$1",
            [comment],
          )
        ).rows[0].n,
        0,
      );
    },
  );
  await check(
    "cleanup claims prevent staged media publication races",
    async () => {
      const id = randomUUID(),
        path = `${b}/${id}`;
      await admin();
      await db.query(
        "insert into storage.objects(bucket_id,name) values('social-media',$1)",
        [path],
      );
      await db.query(
        "insert into public.post_media(id,author_id,storage_path,filename,mime,kind,byte_size,created_at) values($1,$2,$3,'expired.webp','image/webp','photo',100,now()-interval '25 hours')",
        [id, b, path],
      );
      const claimed = (
        await db.query("select * from public.social_cleanup_files(null,500)")
      ).rows;
      assert.ok(claimed.some((m) => m.id === id));
      await denied(() => create(b, { media: [id] }));
      await admin();
      assert.ok(
        (
          await db.query(
            "select removed_at from public.post_media where id=$1",
            [id],
          )
        ).rows[0].removed_at,
      );
    },
  );
  await check(
    "community reports require community staff; global approval grants no private community bypass",
    async () => {
      await cmd(a, "report", {
        post: communityPost,
        reason: "other",
        detail: "Review",
      });
      await admin();
      await db.query("insert into private.social_moderators values($1)", [c]);
      assert.equal(
        (await rpc(c, "social_report_page", {})).items.some(
          (r) => r.post_id === communityPost,
        ),
        false,
      );
      const report = (await rpc(d, "social_report_page", {})).items.find(
        (r) => r.post_id === communityPost,
      );
      assert.ok(report);
      await cmd(d, "moderate", { report: report.id, decision: "dismiss" });
    },
  );
  await check(
    "moderators cannot remove community owners or peers",
    async () => {
      const owned = (await create(a, { community, audience: "community" })).id;
      await cmd(b, "report", { post: owned, reason: "spam" });
      const report = (await rpc(d, "social_report_page", {})).items.find(
        (r) => r.post_id === owned,
      );
      await denied(() =>
        cmd(d, "moderate", { report: report.id, decision: "remove" }),
      );
    },
  );
  await check(
    "server-valid media must be owned and staged exactly once",
    async () => {
      const media = randomUUID();
      await admin();
      await db.query(
        "insert into public.post_media(id,author_id,storage_path,filename,mime,kind,byte_size) values($1,$2,$3,'photo.webp','image/webp','photo',100)",
        [media, b, `${b}/${media}`],
      );
      await denied(() => create(c, { media: [media] }));
      const p = (await create(b, { media: [media] })).id;
      assert.equal((await get(c, p)).media[0].id, media);
      await denied(() => create(b, { media: [media] }));
      assert.equal(
        await rpc(c, "register_post_media", {
          p_id: randomUUID(),
          p_path: `${b}/${media}`,
          p_filename: "stolen",
          p_mime: "image/webp",
          p_kind: "photo",
          p_size: 100,
          p_rights: false,
        }),
        false,
      );
    },
  );
  await check(
    "private media metadata and storage paths cannot leak",
    async () => {
      const media = randomUUID();
      await admin();
      await db.query(
        "insert into public.post_media(id,author_id,storage_path,filename,mime,kind,byte_size) values($1,$2,$3,'private.webp','image/webp','photo',100)",
        [media, b, `${b}/${media}`],
      );
      await create(b, { audience: "community", community, media: [media] });
      await role(c);
      assert.equal(
        (
          await db.query(
            "select count(*)::int n from public.post_media where id=$1",
            [media],
          )
        ).rows[0].n,
        0,
      );
      await denied(async () => {
        await role(b);
        await db.query("select storage_path from public.post_media");
      });
    },
  );
  await check(
    "storage bucket is private and restrictive policies defeat broad unrelated policies",
    async () => {
      await admin();
      assert.equal(
        (
          await db.query(
            "select public from storage.buckets where id='social-media'",
          )
        ).rows[0].public,
        false,
      );
      await db.query(
        "create policy test_social_broad on storage.objects for all to authenticated using(true) with check(true)",
      );
      await denied(async () => {
        await role(b);
        await db.query(
          "insert into storage.objects(bucket_id,name) values('social-media','forged')",
        );
      });
    },
  );
  await check(
    "ordinary members cannot inject previews or perform cleanup",
    async () => {
      await denied(() =>
        rpc(b, "store_post_preview", {
          p_post: shared,
          p_body: "x",
          p_url: "https://evil.invalid",
          p_title: "forged",
          p_description: "x",
          p_hostname: "evil.invalid",
        }),
      );
      await denied(() => rpc(b, "social_cleanup_files", {}));
    },
  );
  await check(
    "post cursors paginate equal-time posts without duplicates",
    async () => {
      await admin();
      for (let i = 0; i < 43; i++)
        await db.query(
          "insert into public.posts(id,author_id,audience,body,interest_tags) values($1,$2,'members',$3,'{creative}')",
          [randomUUID(), b, `Paged ${i}`],
        );
      const first = await feed(c, { p_interest: "creative" }),
        second = await feed(c, {
          p_interest: "creative",
          p_before: first.next,
        }),
        third = await feed(c, {
          p_interest: "creative",
          p_before: second.next,
        });
      assert.equal(first.items.length, 20);
      assert.equal(second.items.length, 20);
      assert.equal(third.items.length, 3);
      assert.equal(
        new Set(
          [...first.items, ...second.items, ...third.items].map((p) => p.id),
        ).size,
        43,
      );
    },
  );
  await check(
    "post/comment/reaction budgets reject excess requests",
    async () => {
      for (const [operation, max] of [
        ["post", 6],
        ["comment", 20],
        ["reaction", 60],
      ]) {
        for (let i = 0; i < max; i++)
          assert.equal(
            await rpc(b, "social_budget", { p_operation: operation }),
            true,
          );
        assert.equal(
          await rpc(b, "social_budget", { p_operation: operation }),
          false,
        );
      }
    },
  );
  await check(
    "losing membership revokes private posts, comments and reactions immediately",
    async () => {
      const ownComment = randomUUID();
      await cmd(b, "comment", {
        id: ownComment,
        post: communityPost,
        body: "Delete after leaving",
      });
      await admin();
      await db.query(
        "delete from public.community_members where community_id=$1 and user_id=$2",
        [community, b],
      );
      assert.equal(await get(b, communityPost), null);
      await cmd(b, "delete-comment", {
        post: communityPost,
        comment: ownComment,
      });
      await denied(() => rpc(b, "social_comments", { p_post: communityPost }));
      await denied(() =>
        cmd(b, "react", { post: communityPost, emoji: "👍", active: true }),
      );
    },
  );
  await check(
    "globally banned identities cannot read member posts",
    async () => {
      await admin();
      await db.query(
        "update auth.users set banned_until=now()+interval '1 hour' where id=$1",
        [c],
      );
      assert.equal(await get(c, shared), null);
      await denied(() =>
        cmd(c, "comment", { id: randomUUID(), post: shared, body: "blocked" }),
      );
    },
  );
  await check(
    "auth identity deletion tombstones social text and cascades follow identities",
    async () => {
      await admin();
      await db.query("delete from auth.users where id=$1", [b]);
      assert.equal(
        (
          await db.query(
            "select count(*)::int n from public.posts where author_id=$1",
            [b],
          )
        ).rows[0].n,
        0,
      );
      assert.equal(
        (await db.query("select body from public.posts where id=$1", [shared]))
          .rows[0].body,
        "",
      );
      assert.equal(
        (
          await db.query(
            "select count(*)::int n from public.follows where followed_id=$1",
            [b],
          )
        ).rows[0].n,
        0,
      );
    },
  );
  console.log(
    `${checks} social authorization/database checks passed (rolled back).`,
  );
} finally {
  await db.query("rollback");
  await db.end();
}
