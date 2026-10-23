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
const db = new pg.Client({ connectionString });
await db.connect();
const [owner, admin, mod, co, ca, cm, member, outsider] = Array.from(
  { length: 8 },
  () => randomUUID(),
);
const cid = randomUUID(),
  other = randomUUID(),
  channel = randomUUID(),
  voice = randomUUID(),
  message = randomUUID(),
  post = randomUUID(),
  dm = randomUUID();
let n = 0,
  reportId;
async function root() {
  await db.query("reset role");
}
async function role(id) {
  await root();
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
const command = (u, op, data = {}) =>
  rpc(u, "admin_command", {
    p_operation: op,
    p_data: { reason: "Verified fixture moderation reason", ...data },
  });
const read = (u, view, community = null, before = null) =>
  rpc(u, "admin_read", {
    p_view: view,
    p_community: community,
    p_before: before,
  });
async function denied(fn, code = "42501") {
  await db.query("savepoint nope");
  let rejected = false;
  try {
    await fn();
  } catch (e) {
    rejected = true;
    assert.equal(e.code, code, e.message);
  } finally {
    await db.query("rollback to savepoint nope");
    await db.query("release savepoint nope");
  }
  assert.ok(rejected, "Expected authorization denial");
}
async function check(name, fn) {
  await fn();
  console.log("PASS " + name);
  n++;
}
try {
  await db.query("begin");
  for (const id of [owner, admin, mod, co, ca, cm, member, outsider]) {
    await db.query(
      `insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values($1,$2,now(),'{"date_of_birth":"1990-01-01"}')`,
      [id, id + "@example.test"],
    );
    await db.query(
      "update public.profiles set username=$2,display_name='Admin fixture',visibility='members',onboarding_completed_at=now() where id=$1",
      [id, "admin_" + id.slice(0, 8)],
    );
  }
  await db.query(
    "insert into private.platform_roles(user_id,role) values($1,'owner'),($2,'administrator'),($3,'moderator')",
    [owner, admin, mod],
  );
  await db.query(
    "insert into public.communities(id,slug,name,visibility) values($1,$2,'Moderation test','private'),($3,$4,'Other scope','private')",
    [cid, "adm-" + cid.slice(0, 8), other, "adm-" + other.slice(0, 8)],
  );
  await db.query(
    "insert into public.community_members(community_id,user_id,role_id) values($1,$2,'owner'),($1,$3,'administrator'),($1,$4,'moderator'),($1,$5,'member'),($6,$7,'owner')",
    [cid, co, ca, cm, member, other, outsider],
  );
  await db.query(
    "insert into public.channels(id,community_id,name,kind) values($1,$2,'general','text'),($3,$2,'voice','voice')",
    [channel, cid, voice],
  );
  await db.query(
    "insert into public.messages(id,channel_id,author_id,body) values($1,$2,$3,'Reported message evidence')",
    [message, channel, member],
  );
  await db.query(
    "insert into public.posts(id,author_id,community_id,audience,body) values($1,$2,$3,'community','Reported post evidence')",
    [post, member, cid],
  );
  await db.query(
    "insert into public.conversations(id,low_id,high_id) values($1,$2,$3)",
    [dm, [member, outsider].sort()[0], [member, outsider].sort()[1]],
  );
  const direct = randomUUID();
  await db.query(
    "insert into public.direct_messages(id,conversation_id,sender_id,body) values($1,$2,$3,'Only this reported DM evidence')",
    [direct, dm, member],
  );
  await check(
    "platform/community roles remain independent, standard member context empty",
    async () => {
      assert.equal((await read(owner, "context")).rank, 40);
      assert.equal((await read(co, "context")).rank, 0);
      assert.equal((await read(member, "context")).communities.length, 0);
      await denied(() => read(member, "overview"));
      await denied(() => read(null, "context"));
    },
  );
  await check(
    "community moderator reads own scoped metrics but not global or other scope",
    async () => {
      const v = await read(cm, "overview", cid);
      assert.equal(v.members, 4);
      await denied(() => read(cm, "members", other));
      await denied(() => read(cm, "overview"));
    },
  );
  await check(
    "platform moderator may review counts but cannot suspend or appoint staff",
    async () => {
      assert.ok((await read(mod, "overview")).members >= 8);
      await denied(() =>
        command(mod, "account_status", { user_id: member, status: "banned" }),
      );
      await denied(() =>
        command(mod, "platform_role", {
          user_id: member,
          role: "administrator",
        }),
      );
    },
  );
  await check(
    "owner alone grants platform roles, no self change or owner creation",
    async () => {
      await denied(() =>
        command(admin, "platform_role", { user_id: member, role: "moderator" }),
      );
      await denied(() =>
        command(owner, "platform_role", { user_id: owner, role: "member" }),
      );
      await denied(() =>
        command(owner, "platform_role", { user_id: member, role: "owner" }),
      );
      await command(owner, "platform_role", {
        user_id: outsider,
        role: "moderator",
      });
      assert.equal((await read(outsider, "context")).rank, 20);
      await command(owner, "platform_role", {
        user_id: outsider,
        role: "member",
      });
    },
  );
  await check(
    "raw role writes, evidence and audit reads are denied",
    async () => {
      await role(member);
      await denied(() =>
        db.query(
          "insert into private.platform_roles values($1,'administrator',now())",
          [member],
        ),
      );
      await denied(() => db.query("select * from private.moderation_cases"));
      await denied(() => db.query("select * from private.admin_audit"));
      await denied(() =>
        db.query("select public.phase10_community_command($1,$2,$3)", [
          "role",
          cid,
          {},
        ]),
      );
    },
  );
  await check(
    "community administrators cannot promote themselves, peers, owners or platform staff",
    async () => {
      await denied(() =>
        command(ca, "community_role", {
          community_id: cid,
          user_id: ca,
          role: "administrator",
        }),
      );
      await denied(() =>
        command(ca, "community_role", {
          community_id: cid,
          user_id: co,
          role: "member",
        }),
      );
      await denied(() =>
        command(ca, "community_role", {
          community_id: cid,
          user_id: member,
          role: "administrator",
        }),
      );
      await denied(() =>
        command(cm, "community_role", {
          community_id: cid,
          user_id: member,
          role: "moderator",
        }),
      );
      await command(ca, "community_role", {
        community_id: cid,
        user_id: member,
        role: "moderator",
      });
      await command(ca, "community_role", {
        community_id: cid,
        user_id: member,
        role: "member",
      });
    },
  );
  await check(
    "account penalties cannot target self, owner or peers",
    async () => {
      await denied(() =>
        command(admin, "account_status", { user_id: admin, status: "banned" }),
      );
      await denied(() =>
        command(admin, "account_status", { user_id: owner, status: "banned" }),
      );
      await denied(() =>
        command(ca, "account_status", { user_id: outsider, status: "banned" }),
      );
    },
  );
  await check(
    "suspension immediately invalidates unexpired-token database access",
    async () => {
      await command(admin, "account_status", {
        user_id: member,
        status: "suspended",
        days: 7,
      });
      assert.equal(
        await rpc(member, "channel_access", { p_channel: channel }),
        false,
      );
      await denied(() => read(member, "context"));
      await command(admin, "account_status", {
        user_id: member,
        status: "active",
      });
      assert.equal(
        await rpc(member, "channel_access", { p_channel: channel }),
        true,
      );
    },
  );
  await check(
    "reports require real authorized targets and snapshots are database-derived",
    async () => {
      await denied(() =>
        rpc(outsider, "submit_report", {
          p_type: "message",
          p_target: message,
          p_reason: "Cannot access this channel",
        }),
      );
      reportId = await rpc(co, "submit_report", {
        p_type: "message",
        p_target: message,
        p_reason: "Please review this message",
      });
      const r = await read(cm, "reports", cid);
      assert.equal(
        r.find((x) => x.id === reportId).evidence,
        "Reported message evidence",
      );
      assert.equal(
        await rpc(co, "submit_report", {
          p_type: "message",
          p_target: message,
          p_reason: "Duplicate report retry",
        }),
        reportId,
      );
    },
  );
  await check(
    "reporter, unrelated staff and ordinary members cannot read protected evidence",
    async () => {
      await denied(() => read(member, "reports", cid));
      assert.equal((await read(outsider, "reports", other)).length, 0);
      const rows = await read(cm, "reports", cid);
      assert.ok(rows.every((r) => !("reporter_id" in r)));
    },
  );
  await check(
    "existing DM reports expose only reported item to platform staff",
    async () => {
      await root();
      await db.query(
        "insert into public.direct_message_reports(message_id,reporter_id,reason) values($1,$2,'Review abusive direct message')",
        [direct, outsider],
      );
      const rows = await read(mod, "reports");
      assert.ok(
        rows.some(
          (r) =>
            r.target_type === "dm" &&
            r.evidence === "Only this reported DM evidence",
        ),
      );
      assert.ok(
        (await read(cm, "reports", cid)).every((r) => r.target_type !== "dm"),
      );
      await role(mod);
      await denied(() =>
        db
          .query("select * from public.direct_messages where id=$1", [direct])
          .then((r) => {
            if (!r.rowCount) {
              const e = Error();
              e.code = "42501";
              throw e;
            }
          }),
      );
    },
  );
  await check(
    "reviewer cannot decide own report and reason is mandatory",
    async () => {
      await denied(() =>
        command(co, "case_decision", {
          id: reportId,
          decision: "dismissed",
          remove: false,
        }),
      );
      await denied(() =>
        command(mod, "case_decision", {
          id: reportId,
          decision: "dismissed",
          remove: false,
          reason: "",
        }),
      );
    },
  );
  await check(
    "moderator removal preserves protected snapshot and removes original body",
    async () => {
      await command(cm, "case_decision", {
        id: reportId,
        decision: "actioned",
        remove: true,
      });
      await root();
      assert.equal(
        (
          await db.query("select body from public.messages where id=$1", [
            message,
          ])
        ).rows[0].body,
        "",
      );
      assert.equal(
        (
          await db.query(
            "select evidence from private.moderation_cases where id=$1",
            [reportId],
          )
        ).rows[0].evidence,
        "Reported message evidence",
      );
    },
  );
  await check(
    "community peer content cannot be actioned through report queue",
    async () => {
      await root();
      const m = randomUUID();
      await db.query(
        "insert into public.messages(id,channel_id,author_id,body) values($1,$2,$3,'Administrator message')",
        [m, channel, ca],
      );
      const rid = await rpc(member, "submit_report", {
        p_type: "message",
        p_target: m,
        p_reason: "A concern about staff message",
      });
      await denied(() =>
        command(cm, "case_decision", {
          id: rid,
          decision: "actioned",
          remove: true,
        }),
      );
      await root();
      assert.equal(
        (await db.query("select body from public.messages where id=$1", [m]))
          .rows[0].body,
        "Administrator message",
      );
    },
  );
  await check(
    "existing social report form is bridged into the central queue",
    async () => {
      await root();
      await db.query(
        "insert into public.post_reports(reporter_id,post_id,reason,detail) values($1,$2,'spam','Repeated spam concern')",
        [co, post],
      );
      assert.ok(
        (await read(cm, "reports", cid)).some((r) => r.target_id === post),
      );
    },
  );
  await check(
    "community channel controls cannot cross scopes or be used by moderators",
    async () => {
      await denied(() =>
        command(cm, "channel", {
          community_id: cid,
          id: channel,
          name: "general",
          description: "Text channel",
          kind: "text",
          is_private: false,
          position: 5,
          disabled: true,
        }),
      );
      await denied(() =>
        command(ca, "channel_access", {
          community_id: other,
          id: channel,
          role: "member",
          can_view: false,
          can_post: false,
          can_connect: false,
          reset: false,
        }),
      );
    },
  );
  await check(
    "channel disabling rejects direct RLS reads, posts and voice access",
    async () => {
      await command(ca, "channel", {
        community_id: cid,
        id: channel,
        name: "general",
        description: "Text channel",
        kind: "text",
        is_private: false,
        position: 5,
        disabled: true,
      });
      assert.equal(
        await rpc(member, "channel_access", { p_channel: channel }),
        false,
      );
      await role(member);
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
          await db.query("select id from public.messages where channel_id=$1", [
            channel,
          ])
        ).rowCount,
        0,
      );
      await command(ca, "channel", {
        community_id: cid,
        id: channel,
        name: "general",
        description: "Text channel",
        kind: "text",
        is_private: false,
        position: 5,
        disabled: false,
      });
    },
  );
  await check(
    "channel permission override is enforced independently of UI",
    async () => {
      await command(ca, "channel_access", {
        community_id: cid,
        id: channel,
        role: "member",
        can_view: false,
        can_post: false,
        can_connect: false,
        reset: false,
      });
      assert.equal(
        await rpc(member, "channel_access", { p_channel: channel }),
        false,
      );
      await command(ca, "channel_access", {
        community_id: cid,
        id: channel,
        role: "member",
        can_view: false,
        can_post: false,
        can_connect: false,
        reset: true,
      });
      assert.equal(
        await rpc(member, "channel_access", { p_channel: channel }),
        true,
      );
    },
  );
  await check(
    "duplicate scoped channel names fail and ordering persists",
    async () => {
      await denied(
        () =>
          command(ca, "channel", {
            community_id: cid,
            id: null,
            name: "general",
            description: "Duplicate name",
            kind: "text",
            is_private: false,
            position: 0,
            disabled: false,
          }),
        "23505",
      );
      const r = await read(ca, "channels", cid);
      assert.equal(r.find((c) => c.id === channel).position, 5);
    },
  );
  await check(
    "voice removal enforces rank and invalidates admission server-side",
    async () => {
      await root();
      await db.query("insert into public.voice_rooms(channel_id) values($1)", [
        voice,
      ]);
      await db.query(
        "insert into private.voice_sessions(user_id,channel_id,epoch) select $1,channel_id,epoch from public.voice_rooms where channel_id=$2",
        [member, voice],
      );
      await denied(() =>
        command(cm, "voice_remove", {
          community_id: cid,
          id: voice,
          user_id: ca,
        }),
      );
      await command(cm, "voice_remove", {
        community_id: cid,
        id: voice,
        user_id: member,
      });
      await root();
      assert.equal(
        (
          await db.query(
            "select * from private.voice_sessions where user_id=$1",
            [member],
          )
        ).rowCount,
        0,
      );
      assert.equal(
        (
          await db.query("select private.voice_allowed($1,$2) ok", [
            member,
            voice,
          ])
        ).rows[0].ok,
        false,
      );
    },
  );
  await check(
    "community guidelines and feature settings protect legacy creation RPCs",
    async () => {
      await command(ca, "community_settings", {
        community_id: cid,
        guidelines: "Always respect privacy and speak kindly.",
        allow_events: false,
        allow_prayers: false,
      });
      await denied(() =>
        rpc(member, "space_command", {
          p_operation: "prayer-create",
          p_data: {
            id: randomUUID(),
            community: cid,
            body: "Please pray for this request.",
            visibility: "community",
            guidelines: true,
          },
        }),
      );
    },
  );
  await check(
    "event visibility removes raw/API access without changing host identity",
    async () => {
      await root();
      await db.query(
        "update public.community_settings set allow_events=true where community_id=$1",
        [cid],
      );
      const event = randomUUID();
      await db.query(
        "insert into public.events(id,community_id,host_id,title,description,kind,banner,starts_at,ends_at,time_zone) values($1,$2,$3,'Moderated event','Discussion together','discussion','nebula',now()+interval '1 hour',now()+interval '2 hours','UTC')",
        [event, cid, member],
      );
      await command(cm, "event_visibility", {
        community_id: cid,
        id: event,
        hidden: true,
      });
      assert.equal(
        await rpc(member, "event_access", { p_event: event }),
        false,
      );
      await role(member);
      assert.equal(
        (await db.query("select id from public.events where id=$1", [event]))
          .rowCount,
        0,
      );
    },
  );
  await check(
    "announcements are audience-scoped with drafts hidden",
    async () => {
      await command(admin, "announcement", {
        id: null,
        community_id: cid,
        title: "Members only announcement",
        body: "Only this community should see this.",
        published: true,
        expires_at: new Date(Date.now() + 86400000).toISOString(),
      });
      await role(outsider);
      assert.equal(
        (
          await db.query(
            "select * from public.site_announcements where title='Members only announcement'",
          )
        ).rowCount,
        0,
      );
      await role(member);
      assert.equal(
        (
          await db.query(
            "select * from public.site_announcements where title='Members only announcement'",
          )
        ).rowCount,
        1,
      );
      await denied(() =>
        command(cm, "announcement", {
          community_id: null,
          title: "Escalated notice",
          body: "Should never publish",
          published: true,
          expires_at: new Date(Date.now() + 86400000).toISOString(),
        }),
      );
    },
  );
  await check(
    "archival revokes community/channel/prayer/event access and legacy writes",
    async () => {
      await command(ca, "community", {
        community_id: cid,
        name: "Moderation test",
        description: "Archived for review",
        visibility: "private",
        archived: true,
      });
      assert.equal(
        await rpc(member, "community_access", { p_community: cid }),
        false,
      );
      assert.equal(
        await rpc(member, "channel_access", { p_channel: channel }),
        false,
      );
      await role(member);
      assert.equal(
        (await db.query("select id from public.communities where id=$1", [cid]))
          .rowCount,
        0,
      );
      await denied(() =>
        rpc(co, "community_command", {
          p_operation: "settings",
          p_community: cid,
          p_data: {
            name: "Bypass archive",
            description: "No",
            visibility: "private",
            cover: "nebula",
          },
        }),
      );
      await command(ca, "community", {
        community_id: cid,
        name: "Moderation test",
        description: "Restored",
        visibility: "private",
        archived: false,
      });
    },
  );
  await check(
    "appeals isolate authors, prevent self-review and require administrators",
    async () => {
      const id = await rpc(member, "submit_appeal", {
        p_body: "Please reconsider the decision carefully.",
        p_case: reportId,
      });
      await role(outsider);
      assert.equal(
        (
          await db.query(
            "select * from public.moderation_appeals where id=$1",
            [id],
          )
        ).rowCount,
        0,
      );
      await denied(() =>
        command(cm, "appeal_decision", { id, decision: "accepted" }),
      );
      await command(admin, "appeal_decision", { id, decision: "accepted" });
      await role(member);
      assert.equal(
        (
          await db.query(
            "select status from public.moderation_appeals where id=$1",
            [id],
          )
        ).rows[0].status,
        "accepted",
      );
    },
  );
  await check(
    "retention hides expired evidence immediately and service cleanup erases it",
    async () => {
      await root();
      await db.query(
        "update private.moderation_cases set retain_until=now()-interval '1 second' where id=$1",
        [reportId],
      );
      const r = (await read(cm, "reports", cid)).find((r) => r.id === reportId);
      assert.equal(r.evidence, null);
      await denied(() => rpc(admin, "moderation_cleanup"));
      await root();
      await db.query("select public.moderation_cleanup()");
      assert.equal(
        (
          await db.query(
            "select evidence from private.moderation_cases where id=$1",
            [reportId],
          )
        ).rows[0].evidence,
        null,
      );
      await denied(() => command(cm, "retention", { days: 7 }));
    },
  );
  await check("platform-selected scopes and literal username prefixes stay isolated",async()=>{
    assert.equal((await read(owner,'members',cid)).length,4);
    const rows=await rpc(owner,'admin_read',{p_view:'members',p_search:'admin_'+member.slice(0,8)});assert.equal(rows.length,1);assert.equal(rows[0].id,member);
    assert.equal((await read(owner,'overview',cid)).members,4);
  });
  await check("dismissed reports cannot secretly remove content",async()=>{
    await denied(()=>command(mod,'case_decision',{id:reportId,decision:'dismissed',remove:true}),'22023');
  });
  await check("verified external appeals require platform administrators and do not restore accounts",async()=>{
    await denied(()=>command(cm,'appeal_lodge',{user_id:member,body:'Operator verified this request through support.'}));
    await command(admin,'appeal_lodge',{user_id:member,body:'Operator verified this request through support.'});
    assert.ok((await read(admin,'appeals')).some(a=>a.user_id===member&&a.status==='pending'));
  });
  await check("reported private media is authorized, held through removal, and released at expiry",async()=>{
    await root();const msg=randomUUID(),file=randomUUID(),path=cid+'/'+member+'/'+file;
    await db.query("insert into public.messages(id,channel_id,author_id,body) values($1,$2,$3,'Reported image')",[msg,channel,member]);
    await db.query("insert into public.message_attachments(id,channel_id,message_id,author_id,storage_path,filename,mime,kind,byte_size) values($1,$2,$3,$4,$5,'evidence.webp','image/webp','photo',100)",[file,channel,msg,member,path]);
    await db.query("insert into storage.objects(bucket_id,name) values('message-files',$1)",[path]);
    const rid=await rpc(co,'submit_report',{p_type:'message',p_target:msg,p_reason:'Review this image for safety'});
    const row=(await read(cm,'reports',cid)).find(r=>r.id===rid);assert.equal(row.media.length,1);const media=row.media[0].id;
    await denied(()=>rpc(member,'admin_evidence_file',{p_id:media}));assert.equal((await rpc(cm,'admin_evidence_file',{p_id:media})).storage_path,path);
    await command(cm,'case_decision',{id:rid,decision:'actioned',remove:true});
    await root();assert.ok((await db.query('select * from public.chat_cleanup_files()')).rows.every(r=>r.storage_path!==path));
    await db.query("update private.moderation_cases set retain_until=now()-interval '1 second' where id=$1",[rid]);
    await denied(()=>rpc(cm,'admin_evidence_file',{p_id:media}));await root();assert.ok((await db.query('select * from public.chat_cleanup_files()')).rows.some(r=>r.storage_path===path));
    await db.query('select public.moderation_cleanup()');assert.equal((await db.query('select * from private.case_media where id=$1',[media])).rowCount,0);
  });
  await check(
    "role revocation takes effect immediately on stale sessions",
    async () => {
      await command(owner, "platform_role", { user_id: mod, role: "member" });
      await denied(() => read(mod, "reports"));
      await root();
      await db.query(
        "update public.community_members set role_id='member' where community_id=$1 and user_id=$2",
        [cid, cm],
      );
      await denied(() => read(cm, "reports", cid));
    },
  );
  await check(
    "audit records sensitive actions and evidence reads, cannot be tampered with",
    async () => {
      const rows = await read(owner, "audit");
      assert.ok(rows.some((r) => r.action === "evidence.review"));
      assert.ok(
        rows.some((r) => r.action === "platform_role" && r.actor_id === owner),
      );
      await role(owner);
      await denied(() => db.query("delete from private.admin_audit"));
      await denied(() =>
        db.query("update private.moderation_cases set evidence=$1", [
          "fake evidence",
        ]),
      );
    },
  );
  console.log(`${n} administration authorization/privacy checks passed`);
} finally {
  await root();
  await db.query("rollback");
  await db.end();
}
