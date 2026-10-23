import pg from "pg";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
const url = readFileSync(".local-stack/database-url", "utf8").trim();
if (!["localhost", "127.0.0.1"].includes(new URL(url).hostname)) throw Error("Local only");
const db = new pg.Client({ connectionString: url }); await db.connect();
const owner = randomUUID(), member = randomUUID(), outsider = randomUUID(), community = randomUUID(), version = randomUUID();
const path = `${owner}/${community}/${version}.webp`;
let count = 0;
async function check(name, fn) { await fn(); console.log("PASS " + name); count++; }
async function as(id) { await db.query("reset role;set local role authenticated"); await db.query("select set_config('request.jwt.claim.sub',$1,true)", [id]); }
async function denied(fn) { await db.query("savepoint denied"); await assert.rejects(fn); await db.query("rollback to savepoint denied"); }
const command = (id, operation, p = null, v = null, size = null) => db.query("select public.community_header_command($1,$2,$3,$4,$5)", [id, operation, p, v, size]);
try {
 await db.query("begin");
 for (const id of [owner, member, outsider]) {
  await db.query(`insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values($1,$2,now(),'{"date_of_birth":"1990-01-01"}')`, [id, id+"@example.test"]);
  await db.query("update public.profiles set username=$2,onboarding_completed_at=now() where id=$1", [id,"header_"+id.slice(0,8)]);
 }
 await db.query("insert into public.communities(id,slug,name,visibility) values($1,$2,'Header test','private')", [community,"header-"+community.slice(0,8)]);
 await db.query("insert into public.community_members(community_id,user_id,role_id) values($1,$2,'owner'),($1,$3,'member')", [community,owner,member]);
 await db.query(`insert into storage.objects(bucket_id,name,metadata) values('community-headers',$1,'{"mimetype":"image/webp","size":100}')`, [path]);
 await as(owner);
 await check("owner may register a server-uploaded image", async()=>{await command(community,"check");await command(community,"save",path,version,100);assert.equal((await db.query("select * from public.community_headers")).rowCount,1);});
 await check("arbitrary object paths and sizes are rejected", async()=>{await denied(()=>command(community,"save",`${member}/${community}/${version}.webp`,version,100));await denied(()=>command(community,"save",path,version,101));});
 await db.query("reset role");
 await db.query("update storage.objects set created_at=now()-interval '2 hours' where bucket_id='community-headers' and name=$1",[path]);
 await check("cleanup never selects an active header",async()=>{assert.equal((await db.query("select * from public.community_header_orphans() where object_path=$1",[path])).rowCount,0);});
 await as(owner);
 await check("old staged objects cannot be registered during cleanup",()=>denied(()=>command(community,"save",path,version,100)));
 await as(member);
 await check("members can view but cannot edit or delete headers",async()=>{assert.equal((await db.query("select * from public.community_headers")).rowCount,1);await denied(()=>command(community,"save",path,version,100));await denied(()=>command(community,"remove"));await denied(()=>db.query("delete from public.community_headers"));});
 await as(outsider);
 await check("private header metadata and commands are isolated",async()=>{assert.equal((await db.query("select * from public.community_headers")).rowCount,0);await denied(()=>command(community,"check"));});
 await check("direct browser storage reads and writes are denied",async()=>{assert.equal((await db.query("select * from storage.objects where bucket_id='community-headers'")).rowCount,0);await denied(()=>db.query("insert into storage.objects(bucket_id,name) values('community-headers','forged')"));});
 await db.query("reset role");await db.query("update public.community_members set role_id='moderator' where community_id=$1 and user_id=$2",[community,owner]);await as(owner);
 await check("role revocation takes effect immediately",()=>denied(()=>command(community,"remove")));
 await db.query("reset role");await db.query("update public.community_members set role_id='owner' where community_id=$1 and user_id=$2",[community,owner]);await as(owner);
 await check("owner removal preserves fallback and records audit",async()=>{await command(community,"remove");assert.equal((await db.query("select * from public.community_headers")).rowCount,0);assert.equal((await db.query("select * from public.community_audit_log where action like 'community.header.%'")).rowCount,2);});
 await check("header mutations are rate limited",async()=>{for(let i=0;i<8;i++) await command(community,"check");await denied(()=>command(community,"check"));});
 await db.query("reset role");
 await check("cleanup selects removed old objects",async()=>{assert.equal((await db.query("select * from public.community_header_orphans() where object_path=$1",[path])).rowCount,1);});
 await check("bucket is private and cleanup is service-only",async()=>{assert.equal((await db.query("select public from storage.buckets where id='community-headers'")).rows[0].public,false);assert.equal((await db.query("select has_function_privilege('authenticated','public.community_header_orphans()','execute') allowed")).rows[0].allowed,false);});
 console.log(`${count} community header checks passed; rolled back.`);
} finally { await db.query("rollback"); await db.end(); }
