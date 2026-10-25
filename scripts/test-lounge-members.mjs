import pg from'pg';import assert from'node:assert/strict';import{readFileSync}from'node:fs';import{randomUUID}from'node:crypto';
const url=readFileSync('.local-stack/database-url','utf8').trim();if(!['127.0.0.1','localhost'].includes(new URL(url).hostname))throw Error('Local only');const d=new pg.Client({connectionString:url});await d.connect();const[a,b,c,old]=Array.from({length:4},()=>randomUUID());let n=0;
async function root(sql,args=[]){await d.query('reset role');return d.query(sql,args);}
async function read(id){await d.query('reset role');await d.query(id?'set local role authenticated':'set local role anon');await d.query("select set_config('request.jwt.claim.sub',$1,true)",[id||'']);return(await d.query('select public.lounge_new_members() value')).rows[0].value;}
async function check(name,fn){await fn();console.log('PASS '+name);n++;}
async function denied(fn){await d.query('savepoint denied');await assert.rejects(fn,e=>e.code==='42501');await d.query('rollback to savepoint denied');}
try{await d.query('begin');for(const id of[a,b,c,old]){await d.query(`insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values($1,$2,now(),'{"date_of_birth":"1990-01-01"}')`,[id,id+'@example.test']);await d.query("update public.profiles set username=$2,display_name='Lounge member',visibility='public',onboarding_completed_at=now() where id=$1",[id,'lounge_'+id.slice(0,8)]);await d.query('update public.member_privacy set discoverable=true where user_id=$1',[id]);}
await root("update public.profiles set created_at=now()-interval '10 days' where id=$1",[old]);
await check('anonymous cannot access new members',()=>denied(()=>read(null)));
await check('only recent visible accounts, bounded cards without email or creation times',async()=>{const r=await read(a);assert.ok(r.items.length<=5);assert.ok(r.items.some(p=>p.id===b));assert.ok(r.items.every(p=>p.id!==a&&p.id!==old&&!('email'in p)&&!('created_at'in p)));});
await check('private and undiscoverable accounts are excluded',async()=>{await root("update public.profiles set visibility='private' where id=$1",[b]);await root('update public.member_privacy set discoverable=false where user_id=$1',[c]);assert.ok((await read(a)).items.every(p=>![b,c].includes(p.id)));await root("update public.profiles set visibility='public' where id=$1",[b]);});
await check('mutual blocks prevent discovery',async()=>{await root("insert into public.member_blocks(blocker_id,blocked_id,label) values($1,$2,'Blocked')",[b,a]);assert.ok((await read(a)).items.every(p=>p.id!==b));await root('delete from public.member_blocks where blocker_id=$1',[b]);});
await check('bans exclude the subject and deny the caller',async()=>{await root("update auth.users set banned_until='infinity' where id=$1",[b]);assert.ok((await read(a)).items.every(p=>p.id!==b));await denied(()=>read(b));});
await check('budgets bound refreshing new-member metadata',async()=>{for(let i=0;i<31;i++)await read(a);assert.equal((await read(a)).limited,true);});
console.log(`${n} lounge member checks passed; rolled back.`);
}finally{await d.query('rollback');await d.end();}
