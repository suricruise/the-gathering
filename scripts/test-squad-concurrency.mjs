// Real concurrent PostgreSQL transactions; only loopback fixtures are committed.
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
const users = Array.from({ length: 9 }, () => randomUUID()),
  host = users[0],
  sessions = [],
  community = randomUUID();
let checks = 0;
async function rpc(actor, name, args = {}) {
  const c = new pg.Client({ connectionString });
  await c.connect();
  try {
    await c.query("begin");
    await c.query("set local role authenticated");
    await c.query(
      "select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)",
      [actor, JSON.stringify({ sub: actor, role: "authenticated" })],
    );
    const r = (
      await c.query(
        `select public.${name}(${Object.keys(args)
          .map((k, i) => `${k}=>$${i + 1}`)
          .join(",")}) value`,
        Object.values(args),
      )
    ).rows[0].value;
    await c.query("commit");
    return r;
  } catch (e) {
    await c.query("rollback");
    throw e;
  } finally {
    await c.end();
  }
}
const cmd = (actor, operation, data) =>
  rpc(actor, "squad_command", { p_operation: operation, p_data: data });
async function make(extra = {}) {
  const id = randomUUID();
  const r = await cmd(host, "create", {
    id,
    title: "Concurrent test group",
    description: "Explicit local race fixture",
    game: "minecraft",
    platform: "pc",
    cross_play: true,
    style: "casual",
    max_players: 2,
    approval: false,
    visibility: "public",
    community: null,
    game_night: false,
    starts_at: null,
    ...extra,
  });
  assert.equal(r.id, id);
  sessions.push(id);
  return id;
}
function results(outcomes, n = 1) {
  assert.equal(outcomes.filter((r) => r.status === "fulfilled").length, n);
  for (const r of outcomes)
    if (r.status === "rejected")
      assert.ok(["54000", "55000"].includes(r.reason.code), r.reason.code);
}
function pass(name) {
  console.log("PASS " + name);
  checks++;
}
try {
  for (const id of users) {
    await db.query(
      'insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values($1,$2,now(),\'{"date_of_birth":"1990-01-01"}\')',
      [id, id + "@example.test"],
    );
    await db.query(
      "update public.profiles set display_name='Concurrent fixture',onboarding_completed_at=now() where id=$1",
      [id],
    );
  }
  const open = await make();
  const joined = await Promise.allSettled(
    users
      .slice(1)
      .map((id) => cmd(id, "join", { session: open, platform: "pc" })),
  );
  results(joined);
  assert.equal(
    (await rpc(host, "squad_detail", { p_session: open })).accepted_count,
    2,
  );
  pass("eight simultaneous joins compete for one remaining place");
  const winner =
    users.slice(1)[joined.findIndex((r) => r.status === "fulfilled")];
  await Promise.all([
    cmd(winner, "join", { session: open, platform: "pc" }),
    cmd(winner, "join", { session: open, platform: "pc" }),
  ]);
  assert.equal(
    (await rpc(host, "squad_detail", { p_session: open })).accepted_count,
    2,
  );
  pass("simultaneous retries preserve one composite membership");
  const approval = await make({ approval: true });
  for (const id of users.slice(1, 4))
    await cmd(id, "join", { session: approval, platform: "pc" });
  const approved = await Promise.allSettled(
    users
      .slice(1, 4)
      .map((id) => cmd(host, "approve", { session: approval, target: id })),
  );
  results(approved);
  assert.equal(
    (await rpc(host, "squad_detail", { p_session: approval })).accepted_count,
    2,
  );
  pass("simultaneous host approvals cannot overbook");
  const cancelled = await make();
  const racing = await Promise.allSettled([
    cmd(host, "cancel", { session: cancelled }),
    cmd(users[5], "join", { session: cancelled, platform: "pc" }),
  ]);
  assert.equal(racing[0].status, "fulfilled");
  assert.equal(
    (await rpc(host, "squad_detail", { p_session: cancelled })).state,
    "cancelled",
  );
  await assert.rejects(
    rpc(users[5], "voice_admit", { p_channel: cancelled }),
    (e) => e.code === "42501",
  );
  pass("cancellation racing a join always ends token eligibility");
  const expiring = await make();
  await db.query("begin");
  await db.query(
    "update public.gaming_sessions set expires_at=clock_timestamp()+interval '300 milliseconds' where id=$1",
    [expiring],
  );
  const waiter = cmd(users[6], "join", {
    session: expiring,
    platform: "pc",
  }).then(
    () => ({ accepted: true }),
    (e) => ({ code: e.code }),
  );
  await new Promise((r) => setTimeout(r, 650));
  await db.query("commit");
  assert.equal((await waiter).code, "55000");
  pass("a join waiting on a row lock rechecks actual expiration time");
  // Replenish only the fixture actor's creation budget to isolate independent races.
  await db.query("delete from private.squad_budgets where user_id=$1", [host]);
  const one = await make(),
    two = await make();
  await db.query(
    "update private.voice_worker set checked_at=clock_timestamp()",
  );
  const admissions = await Promise.allSettled([
    rpc(host, "voice_admit", { p_channel: one }),
    rpc(host, "voice_admit", { p_channel: two }),
  ]);
  results(admissions);
  let ticket = admissions.find((r) => r.status === "fulfilled").value.ticket;
  await rpc(host, "voice_session", { p_ticket: ticket, p_leave: true });
  pass(
    "concurrent group token requests allow only one active voice reservation",
  );
  await db.query(
    "insert into public.communities(id,slug,name,visibility) values($1,$2,'Concurrent voice fixture','private')",
    [community, "race-" + community.slice(0, 8)],
  );
  await db.query(
    "insert into public.community_members(community_id,user_id,role_id) values($1,$2,'owner')",
    [community, host],
  );
  const channel = randomUUID();
  await db.query(
    "insert into public.channels(id,community_id,name,kind) values($1,$2,'race-voice','voice')",
    [channel, community],
  );
  await db.query(
    "update private.voice_worker set checked_at=clock_timestamp()",
  );
  const cross = await Promise.allSettled([
    rpc(host, "voice_admit", { p_channel: channel }),
    rpc(host, "voice_admit", { p_channel: one }),
  ]);
  results(cross);
  assert.equal(
    (
      await db.query(
        "select (select count(*) from private.voice_sessions where user_id=$1)+(select count(*) from private.squad_voice_sessions where user_id=$1) n",
        [host],
      )
    ).rows[0].n,
    "1",
  );
  ticket = cross.find((r) => r.status === "fulfilled").value.ticket;
  await rpc(host, "voice_session", { p_ticket: ticket, p_leave: true });
  pass("community and squad admissions share the same identity lock");
  await cmd(winner, "withdraw", { session: open });
  const blockJoin = await Promise.allSettled([
    cmd(winner, "join", { session: open, platform: "pc" }),
    cmd(host, "block-member", { session: open, target: winner }),
  ]);
  assert.equal(blockJoin[1].status, "fulfilled");
  let membership = (
    await db.query(
      "select status from public.gaming_session_members where session_id=$1 and user_id=$2",
      [open, winner],
    )
  ).rows[0];
  assert.ok(!["accepted", "pending"].includes(membership.status));
  await cmd(host, "unblock", { target: winner });
  membership = (
    await db.query(
      "select status from public.gaming_session_members where session_id=$1 and user_id=$2",
      [open, winner],
    )
  ).rows[0];
  assert.ok(!["accepted", "pending"].includes(membership.status));
  pass(
    "a block racing a join separates the group without restoration on unblock",
  );
  const acceptedUser = users.slice(1, 4)[
    approved.findIndex((r) => r.status === "fulfilled")
  ];
  const pendingUser = users.slice(1, 4).find((id) => id !== acceptedUser);
  await cmd(host, "remove", { session: approval, target: acceptedUser });
  const blockApproval = await Promise.allSettled([
    cmd(host, "approve", { session: approval, target: pendingUser }),
    cmd(pendingUser, "block-host", { session: approval }),
  ]);
  assert.equal(blockApproval[1].status, "fulfilled");
  assert.equal(
    (
      await db.query(
        "select status from public.gaming_session_members where session_id=$1 and user_id=$2",
        [approval, pendingUser],
      )
    ).rows[0].status,
    "withdrawn",
  );
  pass("a block racing approval cannot leave an approved blocked membership");
  const joint = await Promise.all([
    cmd(host, "join", { session: one, platform: "pc" }),
    rpc(host, "voice_admit", { p_channel: one }),
  ]);
  assert.equal(joint[0].status, "accepted");
  await rpc(host, "voice_session", {
    p_ticket: joint[1].ticket,
    p_leave: true,
  });
  pass("membership and voice admission do not share inverted budget locks");
  console.log(`${checks} real concurrent Squad Up checks passed.`);
} finally {
  await db.query("rollback");
  await db.query(
    "delete from private.squad_audit where session_id=any($1::uuid[])",
    [sessions],
  );
  await db.query("delete from public.communities where id=$1", [community]);
  await db.query("delete from auth.users where id=any($1::uuid[])", [users]);
  await db.end();
}
