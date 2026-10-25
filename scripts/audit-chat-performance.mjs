// Local query-plan rehearsal. Never fixture or ANALYZE hosted databases.
import pg from 'pg';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
const url=readFileSync('.local-stack/database-url','utf8').trim();
if(!['127.0.0.1','localhost'].includes(new URL(url).hostname))throw Error('Local database required');
const db=new pg.Client({connectionString:url});await db.connect();
const community=randomUUID(),channel=randomUUID(),root=randomUUID();
try{
 await db.query('begin');
 await db.query("insert into public.communities(id,slug,name) values($1,$2,'Query plan fixture')",[community,'qa-'+community]);
 await db.query("insert into public.channels(id,community_id,name) values($1,$2,'query-plan')",[channel,community]);
 await db.query("insert into public.messages(id,channel_id,body) values($1,$2,'Thread root')",[root,channel]);
 await db.query("insert into public.messages(id,channel_id,body) select gen_random_uuid(),$1,case when i%100=0 then 'quasarneedle gaming' else 'Gaming history' end from generate_series(1,5000)i",[channel]);
 await db.query("insert into public.messages(id,channel_id,parent_id,body) select gen_random_uuid(),$1,$2,'Thread history' from generate_series(1,1000)",[channel,root]);
 await db.query('analyze public.messages');
 const queries=[
 ['root page',"select * from public.messages where channel_id=$1 and parent_id is null order by created_seq desc limit 40",[channel]],
 ['thread page',"select * from public.messages where channel_id=$1 and parent_id=$2 order by created_seq desc limit 40",[channel,root]],
 ['revision catch-up',"select * from public.messages where channel_id=$1 and version>0 order by version limit 200",[channel]],
 ['search page',"select id,created_seq from public.messages where channel_id=$1 and deleted_at is null and search_document @@ plainto_tsquery('simple','quasarneedle') order by created_seq desc limit 31",[channel]],
 ['unread count',"select count(*) from public.messages where channel_id=$1 and deleted_at is null and created_seq>0",[channel]],
 ];
 const results=[];
 for(const[name,query,params]of queries){const plan=(await db.query('explain (analyze,buffers,format json) '+query,params)).rows[0]['QUERY PLAN'][0];const indexes=new Set();let scans=[];function visit(node){if(node['Index Name'])indexes.add(node['Index Name']);if(node['Node Type'].includes('Scan'))scans.push(node['Node Type']);for(const child of node.Plans??[])visit(child);}visit(plan.Plan);results.push({query:name,rows:plan.Plan['Actual Rows'],execution_ms:plan['Execution Time'],planning_ms:plan['Planning Time'],indexes:[...indexes],scans});}
 console.log(JSON.stringify({fixture:{roots:5001,replies:1000},context:'Single local PostgreSQL session; engine plans, not authenticated end-to-end or production latency',results},null,2));
}finally{await db.query('rollback');await db.query('analyze public.messages');await db.end();}
