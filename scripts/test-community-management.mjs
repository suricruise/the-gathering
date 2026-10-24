import pg from "pg";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
const url=readFileSync(".local-stack/database-url","utf8").trim();
if (!["localhost","127.0.0.1"].includes(new URL(url).hostname)) throw Error("Local only");
const db=new pg.Client({connectionString:url});await db.connect();
const [owner,admin,mod,co,ca,member,outsider]=Array.from({length:7},()=>randomUUID());
const c=randomUUID(),other=randomUUID(),text=randomUUID(),voice=randomUUID(),root=randomUUID(),reply=randomUUID(),post=randomUUID(),prayer=randomUUID(),event=randomUUID(),session=randomUUID();
const slug="manage-"+c.slice(0,8), otherSlug="manage-"+other.slice(0,8);
let count=0;
async function as(id){await db.query("reset role");await db.query(id?"set local role authenticated":"set local role anon");await db.query("select set_config('request.jwt.claim.sub',$1,true)",[id||""]);}
async function manage(user,op,id,extra={}){await as(user);return db.query("select public.community_manage($1,$2,$3,$4,$5)",[op,id,"Reviewed community management",extra.position??null,extra.confirmation??null]);}
async function denied(fn,code="42501"){await db.query("savepoint denied");await assert.rejects(fn,e=>e.code===code);await db.query("rollback to savepoint denied");}
async function check(name,fn){await fn();console.log("PASS "+name);count++;}
async function directory(user){await as(user);return (await db.query("select public.community_directory() items")).rows[0].items;}
try{
 await db.query("begin");
 for(const id of [owner,admin,mod,co,ca,member,outsider]){
  await db.query(`insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values($1,$2,now(),'{"date_of_birth":"1990-01-01"}')`,[id,id+"@example.test"]);
  await db.query("update public.profiles set username=$2,onboarding_completed_at=now() where id=$1",[id,"manage_"+id.slice(0,8)]);
 }
 await db.query("insert into private.platform_roles(user_id,role) values($1,'owner'),($2,'administrator'),($3,'moderator')",[owner,admin,mod]);
 await db.query("insert into public.communities(id,slug,name,visibility) values($1,$2,'ZZZ ordered community','private'),($3,$4,'AAA other community','public')",[c,slug,other,otherSlug]);
 await db.query("insert into public.community_members(community_id,user_id,role_id) values($1,$2,'owner'),($1,$3,'administrator'),($1,$4,'member'),($5,$6,'owner')",[c,co,ca,member,other,outsider]);
 await db.query("insert into public.channels(id,community_id,name,kind) values($1,$2,'general','text'),($3,$2,'voice','voice')",[text,c,voice]);
 await db.query("insert into public.messages(id,channel_id,author_id,body) values($1,$2,$3,'Retained moderation evidence')",[root,text,member]);
 await db.query("insert into public.messages(id,channel_id,author_id,parent_id,reply_to_id,body) values($1,$2,$3,$4,$4,'Thread reply')",[reply,text,co,root]);
 await db.query("insert into public.posts(id,community_id,author_id,audience,body) values($1,$2,$3,'community','Private community post')",[post,c,member]);
 await db.query("insert into public.prayer_requests(id,community_id,author_id,body,visibility) values($1,$2,$3,'Sensitive private request','moderators')",[prayer,c,member]);
 await db.query("insert into public.events(id,community_id,host_id,title,description,kind,banner,starts_at,ends_at,time_zone,voice_channel_id) values($1,$2,$3,'Community event','Discussion event','voice','nebula',now()+interval '1 day',now()+interval '25 hours','UTC',$4)",[event,c,co,voice]);
 await db.query("insert into public.gaming_sessions(id,host_id,title,description,game_id,platform_id,play_style,max_players,visibility,community_id,expires_at) values($1,$2,'Community squad','Gaming session','minecraft','pc','casual',4,'community',$3,now()+interval '1 day')",[session,co,c]);
 await db.query("insert into public.gaming_session_members(session_id,user_id,platform_id,status) values($1,$2,'pc','accepted')",[session,co]);
 await db.query("insert into public.community_headers(community_id,version,object_path,byte_size) values($1,$2,$3,100)",[c,randomUUID(),`header/${c}`]);
 await db.query("insert into private.moderation_cases(reporter_id,community_id,target_type,target_id,subject_id,reason,evidence,retain_until) values($1,$2,'message',$3,$4,'Review this message','Retained moderation evidence',now()+interval '30 days')",[co,c,root,member]);
 await check("platform managers can set an explicit shared order",async()=>{await manage(admin,"community_order",c,{position:0});await manage(owner,"community_order",other,{position:1});const list=await directory(co);assert.ok(list.findIndex(x=>x.id===c)<list.findIndex(x=>x.id===other));});
 await check("private communities never enter unrelated member directories",async()=>{const list=await directory(outsider);assert.ok(!list.some(x=>x.id===c));assert.ok(list.some(x=>x.id===other));});
 await check("moderators, community owners and standard members cannot reorder globally",async()=>{for(const id of [mod,co,ca,member,outsider])await denied(()=>manage(id,"community_order",c,{position:2}));});
 await check("negative, oversized and unknown operations are rejected",async()=>{await denied(()=>manage(admin,"community_order",c,{position:-1}),"22023");await denied(()=>manage(admin,"community_order",c,{position:1000000}),"22023");await denied(()=>manage(admin,"make_owner",c),"22023");});
 await check("client table writes cannot bypass management authorization",async()=>{await as(member);await denied(()=>db.query("update public.communities set display_order=0 where id=$1",[c]));await denied(()=>db.query("delete from public.communities where id=$1",[c]));});
 await check("deletion rejects wrong confirmation without losing content",async()=>{await denied(()=>manage(owner,"community_delete",c,{confirmation:"wrong-address"}),"22023");await as(co);assert.equal((await db.query("select id from public.messages where id=$1",[root])).rowCount,1);});
 await check("nonowners and unrelated owners cannot delete a community",async()=>{for(const id of [mod,ca,member,outsider])await denied(()=>manage(id,"community_delete",c,{confirmation:slug}));});
 await check("revoked platform administrator loses deletion access",async()=>{await db.query("reset role");await db.query("delete from private.platform_roles where user_id=$1",[admin]);await denied(()=>manage(admin,"community_delete",c,{confirmation:slug}));});
 await check("suspended owners cannot delete",async()=>{await db.query("reset role");await db.query("update auth.users set banned_until='infinity' where id=$1",[co]);await denied(()=>manage(co,"community_delete",c,{confirmation:slug}));await db.query("reset role");await db.query("update auth.users set banned_until=null where id=$1",[co]);});
 await check("community owner can permanently delete even an archived community",async()=>{await db.query("reset role");await db.query("update public.communities set archived=true where id=$1",[c]);await manage(co,"community_delete",c,{confirmation:slug});await db.query("reset role");for(const [table,column,id] of [["communities","id",c],["community_members","community_id",c],["channels","community_id",c],["messages","id",root],["messages","id",reply],["posts","id",post],["prayer_requests","id",prayer],["events","id",event],["gaming_sessions","id",session],["gaming_session_members","session_id",session],["community_headers","community_id",c],["voice_rooms","channel_id",voice]])assert.equal((await db.query(`select 1 from public.${table} where ${column}=$1`,[id])).rowCount,0);});
 await check("moderation evidence and deletion audit survive without widening community access",async()=>{await db.query("reset role");const evidence=(await db.query("select community_id,evidence from private.moderation_cases where target_id=$1",[root])).rows[0];assert.equal(evidence.community_id,null);assert.equal(evidence.evidence,"Retained moderation evidence");assert.equal((await db.query("select 1 from private.admin_audit where action='community_delete' and target_id=$1 and actor_id=$2",[c,co])).rowCount,1);await as(ca);await denied(()=>db.query("select public.admin_read('reports',null,null,'')"));});
 await check("platform owner can delete unrelated communities",async()=>{await manage(owner,"community_delete",other,{confirmation:otherSlug});await db.query("reset role");assert.equal((await db.query("select 1 from public.communities where id=$1",[other])).rowCount,0);});
 await check("anonymous requests cannot use management or directory functions",async()=>{await denied(()=>manage(null,"community_delete",other,{confirmation:otherSlug}));await denied(()=>directory(null));});
 console.log(`${count} management authorization/deletion/order checks passed; rolled back.`);
}finally{await db.query("rollback");await db.end();}
