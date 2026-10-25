import {test,expect} from './helpers';
import pg from 'pg';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
test('channel navigation closes obsolete private chat sockets and leaving chat cleans them up',async({memberPage:page,member})=>{
 test.setTimeout(90000);
 const url=readFileSync('.local-stack/database-url','utf8').trim();if(!['127.0.0.1','localhost'].includes(new URL(url).hostname))throw Error('Local only');
 const db=new pg.Client({connectionString:url});await db.connect();const community=randomUUID(),channels=Array.from({length:3},()=>randomUUID());
 const active=new Set<object>();
 page.on('websocket',socket=>{
  if(!socket.url().includes('/realtime/'))return;
  // A leave frame alone is insufficient: retain ownership until the socket actually closes.
  socket.on('framesent',frame=>{if(typeof frame.payload!=='string')return;try{const message=JSON.parse(frame.payload),event=Array.isArray(message)?message[3]:message.event,topic=Array.isArray(message)?message[2]:message.topic;if(event==='phx_join'&&typeof topic==='string'&&topic.startsWith('realtime:chat:'))active.add(socket);}catch{/* Ignore non-JSON provider control frames. */}});
  socket.on('close',()=>active.delete(socket));
 });
 const chatSockets=()=>active.size;
 try{
  await db.query("insert into public.communities(id,slug,name,visibility) values($1,$2,'Cleanup fixture','private')",[community,'cleanup-'+community]);
  await db.query("insert into public.community_members(community_id,user_id,role_id) values($1,$2,'owner')",[community,member.id]);
  for(let i=0;i<channels.length;i++)await db.query('insert into public.channels(id,community_id,name) values($1,$2,$3)',[channels[i],community,'cleanup-'+i]);
  await page.goto(`/channels/${channels[0]}`);await expect(page.locator('.chat-connection')).toHaveText('● Live');await expect.poll(chatSockets).toBe(1);
  for(const index of[1,2,0,2,1]){
   if(test.info().project.name==='mobile')await page.getByRole('button',{name:'Open channels',exact:true}).click();
   const navigation=test.info().project.name==='mobile'?page.getByRole('dialog',{name:'Channels',exact:true}):page.getByRole('complementary',{name:'Channel directory',exact:true});
   await navigation.locator(`a[href="/channels/${channels[index]}"]`).click();await expect(page.getByRole('heading',{name:'# cleanup-'+index,exact:true})).toBeVisible();await expect(page.locator('.chat-connection')).toHaveText('● Live');await expect.poll(chatSockets).toBe(1);
  }
  // Use client navigation; a full page reload would hide a component cleanup leak.
  if(test.info().project.name==='mobile')await page.getByRole('button',{name:'Open channels',exact:true}).click();
  await page.locator('.workspace-discover-link').filter({visible:true}).click();
  await expect(page).toHaveURL(/\/communities$/);await expect.poll(chatSockets).toBe(0);
 }finally{await db.query('delete from public.communities where id=$1',[community]);await db.end();}
});
