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
const [a, b, c, m] = Array.from({ length: 4 }, () => randomUUID());
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
const cmd = (id, operation, data = {}) =>
  rpc(id, "space_command", { p_operation: operation, p_data: data });
const read = (id, view, resource = null, community = null, before = null) =>
  rpc(id, "space_read", {
    p_view: view,
    p_resource: resource,
    p_community: community,
    p_before: before,
  });
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
  await db.query("delete from private.space_budgets");
}
const prefs = {
  friend_requests: true,
  replies: true,
  mentions: false,
  community_invitations: false,
  event_reminders: false,
  event_updates: true,
  gaming_invitations: false,
  moderator_notices: true,
  daily_content: false,
};
const community = randomUUID(),
  other = randomUUID(),
  secret = "PRIVATE PRAYER CONFIDENTIAL 98321";
let prayer, event, publicPrayer;
const times = (minutes = 30) => ({
  starts_local: new Date(Date.now() + minutes * 60000)
    .toISOString()
    .slice(0, 16),
  ends_local: new Date(Date.now() + (minutes + 60) * 60000)
    .toISOString()
    .slice(0, 16),
});
const makeEvent = (extra = {}) =>
  cmd(a, "event-create", {
    id: randomUUID(),
    community,
    title: "A real community gathering",
    description: "Bring kindness and good comms.",
    kind: "gaming",
    banner: "nebula",
    ...times(),
    time_zone: "UTC",
    session: null,
    voice: null,
    ...extra,
  });
try {
  await db.query("begin");
  for (const id of [a, b, c, m]) {
    await db.query(
      `insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values($1,$2,now(),'{"date_of_birth":"1990-01-01"}')`,
      [id, id + "@example.test"],
    );
    await db.query(
      "update public.profiles set username=$2,display_name=$3,visibility='members',onboarding_completed_at=now() where id=$1",
      [id, "space_" + id.slice(0, 8), "Member " + id.slice(0, 4)],
    );
  }
  await db.query(
    "insert into public.communities(id,slug,name,visibility) values($1,$2,'Faith test','private'),($3,$4,'Other faith test','private')",
    [
      community,
      "faith-" + community.slice(0, 8),
      other,
      "faith-" + other.slice(0, 8),
    ],
  );
  await db.query(
    "insert into public.community_members(community_id,user_id,role_id) values($1,$2,'owner'),($1,$3,'member'),($1,$4,'moderator'),($5,$2,'owner')",
    [community, a, b, m, other],
  );
  await check(
    "notification defaults require opt-in for mentions, invitations and reminders",
    async () => {
      const v = (await read(b, "context")).preferences;
      assert.equal(v.mentions, false);
      assert.equal(v.community_invitations, false);
      assert.equal(v.gaming_invitations, false);
      assert.equal(v.event_reminders, false);
      assert.equal(v.daily_content, false);
    },
  );
  await check(
    "private prayers are author/moderator-only across raw reads, lists and RPC",
    async () => {
      prayer = (
        await cmd(a, "prayer-create", {
          id: randomUUID(),
          community,
          body: secret,
          visibility: "moderators",
          guidelines: true,
        })
      ).id;
      assert.equal((await read(a, "prayer", prayer)).prayer.body, secret);
      assert.equal((await read(m, "prayer", prayer)).prayer.body, secret);
      assert.equal((await read(b, "prayers", null, community)).items.length, 0);
      await denied(() => read(b, "prayer", prayer));
      await denied(() => read(c, "prayer", prayer));
      await role(b);
      assert.equal(
        (await db.query("select * from public.prayer_requests")).rowCount,
        0,
      );
    },
  );
  await check(
    "community prayers require active membership, including public communities",
    async () => {
      publicPrayer = (
        await cmd(a, "prayer-create", {
          id: randomUUID(),
          community,
          body: "Please pray for my family",
          visibility: "community",
          guidelines: true,
        })
      ).id;
      assert.ok((await read(b, "prayer", publicPrayer)).prayer);
      await admin();
      await db.query(
        "update public.communities set visibility='public' where id=$1",
        [community],
      );
      await denied(() => read(c, "prayer", publicPrayer));
      await denied(() =>
        cmd(c, "prayer-create", {
          id: randomUUID(),
          community,
          body: "Intrusion",
          visibility: "community",
          guidelines: true,
        }),
      );
    },
  );
  await check(
    "guideline consent and bounded non-empty prayer text are enforced in SQL",
    async () => {
      await denied(
        () =>
          cmd(a, "prayer-create", {
            id: randomUUID(),
            community,
            body: "No consent",
            visibility: "moderators",
            guidelines: false,
          }),
        "22023",
      );
      await denied(
        () =>
          cmd(a, "prayer-create", {
            id: randomUUID(),
            community,
            body: " ",
            visibility: "moderators",
            guidelines: true,
          }),
        "22023",
      );
    },
  );
  await check(
    "private encouragement creates generic notifications with no prayer/comment contents",
    async () => {
      await cmd(m, "prayer-comment", {
        id: randomUUID(),
        prayer,
        body: "A private encouragement with " + secret,
      });
      const rows = (await read(a, "notifications")).items;
      assert.equal(rows.length, 1);
      assert.doesNotMatch(
        JSON.stringify(rows),
        /CONFIDENTIAL|encouragement|Member/,
      );
      await admin();
      assert.doesNotMatch(
        JSON.stringify(
          (await db.query("select * from public.notifications")).rows,
        ),
        /CONFIDENTIAL|private encouragement/,
      );
      await role(b);
      assert.equal(
        (await db.query("select * from public.prayer_comments")).rowCount,
        0,
      );
      assert.equal(
        (await db.query("select * from public.notifications")).rowCount,
        0,
      );
    },
  );
  await check(
    "mentions require recipient opt-in and current resource permissions",
    async () => {
      await cmd(a, "prayer-comment", {
        id: randomUUID(),
        prayer: publicPrayer,
        body: "@space_" + b.slice(0, 8) + " @space_" + c.slice(0, 8),
      });
      assert.equal((await read(b, "notifications")).items.length, 0);
      await cmd(b, "preferences", { ...prefs, mentions: true });
      await cmd(c, "preferences", { ...prefs, mentions: true });
      await cmd(a, "prayer-comment", {
        id: randomUUID(),
        prayer: publicPrayer,
        body: "@space_" + b.slice(0, 8) + " @space_" + c.slice(0, 8),
      });
      assert.equal((await read(b, "notifications")).items[0].kind, "mentions");
      assert.equal((await read(c, "notifications")).items.length, 0);
    },
  );
  await check(
    "encouragement is idempotent, private to each actor and withdrawable",
    async () => {
      await cmd(b, "prayer-encourage", { prayer: publicPrayer, enabled: true });
      await cmd(b, "prayer-encourage", { prayer: publicPrayer, enabled: true });
      assert.equal(
        (await read(a, "prayer", publicPrayer)).prayer.encouragements,
        1,
      );
      await role(a);
      assert.equal(
        (await db.query("select * from public.prayer_encouragements")).rowCount,
        0,
      );
      await cmd(b, "prayer-encourage", {
        prayer: publicPrayer,
        enabled: false,
      });
      assert.equal(
        (await read(a, "prayer", publicPrayer)).prayer.encouragements,
        0,
      );
    },
  );
  await check(
    "sensitive moderation requires community role and a reason; hidden content stays scoped",
    async () => {
      await denied(() =>
        cmd(b, "prayer-status", {
          prayer: publicPrayer,
          status: "hidden",
          reason: "Protect privacy",
        }),
      );
      await denied(
        () =>
          cmd(m, "prayer-status", {
            prayer: publicPrayer,
            status: "hidden",
            reason: "",
          }),
        "22023",
      );
      await admin();
      await db.query(
        "update public.community_members set role_id='member' where community_id=$1 and user_id=$2",
        [community, a],
      );
      await cmd(m, "prayer-status", {
        prayer: publicPrayer,
        status: "hidden",
        reason: "Protect privacy",
      });
      await denied(() => read(b, "prayer", publicPrayer));
      await denied(() =>
        cmd(a, "prayer-status", {
          prayer: publicPrayer,
          status: "open",
          reason: "",
        }),
      );
      await cmd(m, "prayer-status", {
        prayer: publicPrayer,
        status: "open",
        reason: "Safe to restore",
      });
      await cmd(a, "prayer-status", {
        prayer: publicPrayer,
        status: "answered",
      });
      assert.equal(
        (await read(b, "prayer", publicPrayer)).prayer.status,
        "answered",
      );
      await admin();
      await db.query(
        "update public.community_members set role_id='owner' where community_id=$1 and user_id=$2",
        [community, a],
      );
    },
  );
  await check(
    "removing moderator membership immediately revokes sensitive prayer access",
    async () => {
      await admin();
      await db.query(
        "update public.community_members set role_id='member' where community_id=$1 and user_id=$2",
        [community, m],
      );
      await denied(() => read(m, "prayer", prayer));
      await admin();
      await db.query(
        "update public.community_members set role_id='moderator' where community_id=$1 and user_id=$2",
        [community, m],
      );
    },
  );
  await check(
    "event creation validates real IANA zones, DST gaps and date intervals",
    async () => {
      await denied(() => makeEvent({ time_zone: "Not/AZone" }), "22023");
      await denied(
        () =>
          makeEvent({
            starts_local: "2027-03-14T02:30",
            ends_local: "2027-03-14T04:00",
            time_zone: "America/New_York",
          }),
        "22023",
      );
      await denied(
        () =>
          makeEvent({
            ...times(),
            ends_local: new Date(Date.now() - 86400000)
              .toISOString()
              .slice(0, 16),
          }),
        "22023",
      );
      event = (await makeEvent()).id;
      const e = await read(b, "event", event);
      assert.equal(e.time_zone, "UTC");
      assert.equal(e.state, "upcoming");
      assert.equal(e.can_manage, false);
      await denied(() => read(c, "event", event));
    },
  );
  await check(
    "only hosts or community staff may update/cancel events",
    async () => {
      await denied(() => cmd(b, "event-cancel", { id: event }));
      await denied(() =>
        cmd(b, "event-update", { id: event, title: "Hijacked" }),
      );
      const e = await read(a, "event", event);
      await cmd(m, "event-update", {
        id: event,
        title: "Updated gathering",
        description: e.description,
        kind: e.kind,
        banner: e.banner,
        ...times(),
        time_zone: "UTC",
        session: null,
        voice: null,
      });
      assert.equal((await read(a, "event", event)).title, "Updated gathering");
    },
  );
  await check(
    "RSVP writes are own-identity only, unique and withdrawable",
    async () => {
      await cmd(b, "rsvp", { id: event, response: "going", user_id: c });
      await cmd(b, "rsvp", { id: event, response: "going" });
      assert.equal((await read(a, "event", event)).going, 1);
      await role(c);
      assert.equal(
        (await db.query("select * from public.event_rsvps")).rowCount,
        0,
      );
      await cmd(b, "rsvp", { id: event, response: "withdraw" });
      assert.equal((await read(a, "event", event)).going, 0);
      await cmd(b, "rsvp", { id: event, response: "going" });
    },
  );
  await check(
    "reminders require an RSVP and both explicit preference gates; scheduler is service-only",
    async () => {
      await admin();
      assert.equal(
        (await db.query("select public.deliver_event_reminders() value"))
          .rows[0].value.delivered,
        0,
      );
      await cmd(b, "preferences", { ...prefs, event_reminders: true });
      await admin();
      assert.equal(
        (await db.query("select public.deliver_event_reminders() value"))
          .rows[0].value.delivered,
        1,
      );
      assert.equal(
        (await db.query("select public.deliver_event_reminders() value"))
          .rows[0].value.delivered,
        0,
      );
      await denied(() => rpc(b, "deliver_event_reminders"));
      assert.ok(
        (await read(b, "notifications")).items.some(
          (n) => n.kind === "event_reminders",
        ),
      );
    },
  );
  await check("automated reminders include opted-in hosts with a Going RSVP",async()=>{
    await cmd(a,'preferences',{...prefs,event_reminders:true});await cmd(a,'rsvp',{id:event,response:'going'});await admin();const pass=(await db.query('select public.deliver_event_reminders() value')).rows[0].value;assert.equal(pass.delivered,1);assert.ok((await read(a,'notifications')).items.some(n=>n.kind==='event_reminders'));await cmd(a,'rsvp',{id:event,response:'withdraw'});
  });
  await check(
    "event cancellation sends opted-in generic updates and invalidates stale reminders/RSVPs",
    async () => {
      await cmd(a, "event-cancel", { id: event });
      const v = await read(b, "notifications");
      assert.ok(v.items.some((n) => n.kind === "event_updates"));
      assert.ok(!v.items.some((n) => n.kind === "event_reminders"));
      assert.doesNotMatch(JSON.stringify(v), /Updated gathering|good comms/);
      await denied(
        () => cmd(b, "rsvp", { id: event, response: "going" }),
        "55000",
      );
    },
  );
  await check(
    "read acknowledgement cannot affect another member’s notifications",
    async () => {
      const notices = (await read(a, "notifications")).items;
      assert.ok(notices.length);
      await cmd(b, "notifications-read", { id: notices[0].id });
      await admin();
      assert.equal(
        (
          await db.query(
            "select read_at from public.notifications where id=$1",
            [notices[0].id],
          )
        ).rows[0].read_at,
        null,
      );
      await cmd(a, "notifications-read", { id: notices[0].id });
      assert.equal((await read(a, "notifications")).items[0].read, true);
    },
  );
  await check(
    "community invitations require staff, accepted friends and recipient opt-in",
    async () => {
      await admin();
      await db.query(
        "insert into public.friendships(low_id,high_id,requested_by,status) values(least($1::uuid,$2::uuid),greatest($1::uuid,$2::uuid),$1,'accepted')",
        [a, b],
      );
      await denied(() =>
        cmd(a, "invite-community", { community: other, target: b }),
      );
      await cmd(b, "preferences", {
        ...prefs,
        community_invitations: true,
        gaming_invitations: true,
      });
      await denied(() =>
        cmd(b, "invite-community", { community: other, target: c }),
      );
      await cmd(a, "invite-community", { community: other, target: b });
      const n = (await read(b, "notifications")).items.find(
        (n) => n.kind === "community_invitations",
      );
      assert.ok(n);
      await denied(() => cmd(c, "accept-community", { id: n.resource_id }));
      const accepted = await cmd(b, "accept-community", { id: n.resource_id });
      assert.ok(accepted.href.startsWith("/communities/"));
      assert.ok(
        (await read(b, "context")).communities.some((c) => c.id === other),
      );
    },
  );
  await check(
    "gaming invitation acceptance grants no membership, capacity or voice token",
    async () => {
      const g = (
        await rpc(a, "squad_command", {
          p_operation: "create",
          p_data: {
            id: randomUUID(),
            title: "Private friends session",
            description: "Local fixture",
            game: "minecraft",
            platform: "pc",
            cross_play: false,
            style: "casual",
            max_players: 4,
            approval: true,
            visibility: "friends",
            community: null,
            game_night: false,
            starts_at: null,
          },
        })
      ).id;
      await cmd(a, "invite-squad", { session: g, target: b });
      const n = (await read(b, "notifications")).items.find(
        (n) => n.kind === "gaming_invitations",
      );
      assert.ok(n);
      await cmd(b, "accept-squad", { id: n.resource_id });
      await admin();
      assert.equal(
        (
          await db.query(
            "select * from public.gaming_session_members where session_id=$1 and user_id=$2",
            [g, b],
          )
        ).rowCount,
        0,
      );
      await denied(() => rpc(b, "voice_admit", { p_channel: g }));
      const linked = (await makeEvent({ session: g })).id;
      assert.equal((await read(m, "event", linked)).gaming_session_id, null);
      await role(m);
      await denied(() =>
        db.query("select gaming_session_id from public.events"),
      );
    },
  );
  await check(
    "moderator notice bodies are recipient-only and never copied into notifications",
    async () => {
      const id = randomUUID();
      await denied(() =>
        cmd(b, "notice-create", { id, community, target: a, body: secret }),
      );
      await cmd(m, "notice-create", { id, community, target: a, body: secret });
      assert.equal((await read(a, "notice", id)).body, secret);
      await denied(() => read(b, "notice", id));
      await denied(() => read(m, "notice", id));
      assert.doesNotMatch(
        JSON.stringify((await read(a, "notifications")).items),
        /CONFIDENTIAL/,
      );
      await denied(() => read(b, "recipients", null, community));
      assert.ok((await read(m, "recipients", null, community)).items.length);
    },
  );
  await check(
    "blocking revokes prayers, event access, mentions and existing pending invitations",
    async () => {
      await cmd(a, "invite-squad", {
        session: (await read(a, "context")).sessions[0].id,
        target: b,
      });
      await admin();
      await db.query(
        "insert into public.member_blocks(blocker_id,blocked_id,label) values($1,$2,'Blocked fixture')",
        [b, a],
      );
      await denied(() => read(b, "prayer", publicPrayer));
      assert.ok(
        !(await read(b, "notifications")).items.some(
          (n) =>
            n.resource_type === "squad_invite" || n.resource_type === "prayer",
        ),
      );
      await denied(() => read(b, "event", event));
      await admin();
      assert.equal(
        (
          await db.query(
            "select * from public.gaming_session_invitations where recipient_id=$1 and status='pending'",
            [b],
          )
        ).rowCount,
        0,
      );
    },
  );
  await check(
    "private operational tables and raw client mutations are inaccessible",
    async () => {
      await role(a);
      await denied(() => db.query("update public.events set host_id=$1", [c]));
      await denied(() =>
        db.query(
          "insert into public.notifications(recipient_id,kind,resource_type,resource_id,dedupe_key) values($1,'replies','prayer',$2,'forged')",
          [b, prayer],
        ),
      );
      await denied(() =>
        db.query("select * from private.community_delivery_tokens"),
      );
      await denied(() => db.query("select * from private.space_audit"));
      await denied(() =>
        db.query("select * from private.notification_delivery_outbox"),
      );
    },
  );
  await check(
    "server request and per-operation spam budgets return explicit limits",
    async () => {
      for (let i = 0; i < 5; i++)
        assert.equal(
          await rpc(c, "space_budget", { p_operation: "prayer" }),
          true,
        );
      assert.equal(
        await rpc(c, "space_budget", { p_operation: "prayer" }),
        false,
      );
      assert.equal(
        (
          await cmd(c, "prayer-create", {
            id: randomUUID(),
            community,
            body: "Spam",
            visibility: "community",
            guidelines: true,
          })
        ).limited,
        true,
      );
    },
  );
  await check(
    "notification opt-outs hide existing entries and suppress new delivery",
    async () => {
      await cmd(a, "preferences", {
        ...prefs,
        replies: false,
        mentions: false,
        moderator_notices: false,
      });
      assert.equal((await read(a, "notifications")).items.length, 0);
      await cmd(m, "prayer-comment", {
        id: randomUUID(),
        prayer,
        body: "Another confidential reply",
      });
      assert.equal((await read(a, "notifications")).items.length, 0);
    },
  );
  await check(
    "existing account event-reminder settings synchronize the new notification gate",
    async () => {
      await rpc(b, "save_my_preferences", {
        p_event_reminders: true,
        p_show_activity: false,
      });
      assert.equal(
        (await read(b, "context")).preferences.event_reminders,
        true,
      );
      await rpc(b, "save_my_preferences", {
        p_event_reminders: false,
        p_show_activity: false,
      });
      assert.equal(
        (await read(b, "context")).preferences.event_reminders,
        false,
      );
    },
  );
  await check(
    "prayer/event sequence pages never overlap or expose another audience",
    async () => {
      await admin();
      for (let i = 0; i < 43; i++)
        await db.query(
          "insert into public.prayer_requests(id,community_id,author_id,body,visibility) values($1,$2,$3,$4,'community')",
          [randomUUID(), community, a, "Paged prayer " + i],
        );
      const first = await read(a, "prayers", null, community);
      const second = await read(
        a,
        "prayers",
        null,
        community,
        first.items.at(-1).seq,
      );
      assert.equal(first.items.length, 20);
      assert.equal(second.items.length, 20);
      assert.equal(
        new Set([...first.items, ...second.items].map((p) => p.id)).size,
        40,
      );
      assert.ok(
        !(await read(b, "prayers", null, community)).items.some(
          (p) => p.author_id === a,
        ),
      );
    },
  );
  await check(
    "anonymous and suspended identities cannot read or subscribe through wrappers",
    async () => {
      await denied(() => read(null, "context"));
      await admin();
      await db.query(
        "update auth.users set banned_until=now()+interval '1 day' where id=$1",
        [a],
      );
      await denied(() => read(a, "prayer", prayer));
      await denied(() => read(a, "notifications"));
    },
  );
  console.log(
    `${checks} Phase 10 privacy/authorization checks passed (rolled back).`,
  );
} finally {
  await db.query("rollback");
  await db.end();
}
