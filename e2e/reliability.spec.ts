import { test, expect, adminClient, userClient, signIn } from './helpers';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import pg from 'pg';
test('real private delivery reconciles optimistic sends, unread paging, typing and offline recovery',async({memberPage:page,member,browser})=>{
 test.setTimeout(180000);
 const connectionString=readFileSync('.local-stack/database-url','utf8').trim();if(!['localhost','127.0.0.1'].includes(new URL(connectionString).hostname))throw Error('Local only');
 const db=new pg.Client({connectionString});await db.connect();
 const community=randomUUID(),channel=randomUUID(),otherChannel=randomUUID(),suffix=randomUUID().slice(0,8),email=`reliable-${suffix}@example.test`,password=`Gathering-${randomUUID()}`;
 const context=await browser.newContext({baseURL:'http://127.0.0.1:4173',viewport:page.viewportSize()!}),peer=await context.newPage();let peerId:string|undefined;
 const thirdContext=await browser.newContext({baseURL:'http://127.0.0.1:4173',viewport:page.viewportSize()!}),thirdPage=await thirdContext.newPage();let thirdId:string|undefined,releaseCatchup=()=>{};
 const device=await browser.newContext({baseURL:'http://127.0.0.1:4173',viewport:page.viewportSize()!}),otherDevice=await device.newPage();
 const errors:string[]=[];for(const p of[page,peer,otherDevice])p.on('pageerror',e=>errors.push(e.message));
 try{
 const created=await adminClient().auth.admin.createUser({email,password,email_confirm:true,user_metadata:{date_of_birth:'1990-01-01'}});expect(created.error).toBeNull();peerId=created.data.user!.id;
 const client=userClient();await client.auth.signInWithPassword({email,password});expect((await client.rpc('save_my_profile',{p_username:`reliable_${suffix}`,p_display_name:'Reliable Peer',p_bio:'',p_visibility:'public',p_interests:['co-op'],p_games:['minecraft'],p_platforms:['pc'],p_complete:true})).data).toBe(true);
 const thirdEmail=`typing-${suffix}@example.test`;const third=await adminClient().auth.admin.createUser({email:thirdEmail,password,email_confirm:true,user_metadata:{date_of_birth:'1990-01-01'}});expect(third.error).toBeNull();thirdId=third.data.user!.id;const thirdClient=userClient();await thirdClient.auth.signInWithPassword({email:thirdEmail,password});expect((await thirdClient.rpc('save_my_profile',{p_username:`typing_${suffix}`,p_display_name:'Typing Member',p_bio:'',p_visibility:'public',p_interests:['co-op'],p_games:['minecraft'],p_platforms:['pc'],p_complete:true})).data).toBe(true);
 await db.query('update public.notification_preferences set mentions=true where user_id=$1',[member.id]);
 await db.query("insert into public.communities(id,slug,name,visibility) values($1,$2,'Reliable community','private')",[community,`reliable-${suffix}`]);
 await db.query("insert into public.community_members(community_id,user_id,role_id) values($1,$2,'owner'),($1,$3,'member')",[community,member.id,peerId]);
 await db.query("insert into public.community_members(community_id,user_id,role_id) values($1,$2,'member')",[community,thirdId]);
 await db.query("insert into public.channels(id,community_id,name,is_private) values($1,$2,'reliable-chat',true)",[channel,community]);
 await db.query("insert into public.channels(id,community_id,name,is_private) values($1,$2,'other-chat',true)",[otherChannel,community]);
 await db.query('insert into public.channel_permission_overrides(community_id,channel_id,user_id,can_view,can_post) values($1,$2,$3,true,true)',[community,channel,peerId]);
 await db.query('insert into public.channel_permission_overrides(community_id,channel_id,user_id,can_view,can_post) values($1,$2,$3,true,true)',[community,channel,thirdId]);
 await db.query("insert into public.messages(id,channel_id,author_id,body) select gen_random_uuid(),$1,$2,'Unread history '||i from generate_series(1,85)i",[channel,peerId]);
 const history=(await db.query('select id from public.messages where channel_id=$1 order by created_seq',[channel])).rows;
 await db.query('insert into public.read_receipts(channel_id,user_id,last_read_seq) select $1,$2,created_seq from public.messages where id=$3',[channel,member.id,history[4].id]);
 await signIn(peer,email,password);await Promise.all([page.goto(`/channels/${channel}`),peer.goto(`/channels/${channel}`)]);
 await signIn(otherDevice,member.email,member.password);await otherDevice.goto(`/channels/${otherChannel}`);if(test.info().project.name==='mobile')await otherDevice.getByRole('button',{name:'Open channels',exact:true}).click();
 await signIn(thirdPage,thirdEmail,password);await thirdPage.goto(`/channels/${channel}`);
 for(const p of[page,peer,thirdPage])await expect(p.locator('.chat-connection')).toHaveText('● Live');
 const main=page.getByRole('region',{name:'Channel conversation',exact:true}),peerMain=peer.getByRole('region',{name:'Channel conversation',exact:true});
 await expect(main.getByText('Unread history 6',{exact:true})).toBeVisible();await expect(main.getByText('Unread history 85',{exact:true})).toHaveCount(0);
 const list=main.getByLabel('Channel messages',{exact:true});
 const initialScroll=await list.evaluate(el=>el.scrollTop);
 const input=peerMain.getByRole('textbox',{name:'Message reliable-chat',exact:true});let typingRequests=0;peer.on('request',request=>{if(request.url().endsWith('/api/chat/typing')&&request.method()==='POST')typingRequests++;});await input.fill('Typing now');await input.fill('Typing now again');await input.fill('Typing now still');
 await thirdPage.getByRole('textbox',{name:'Message reliable-chat',exact:true}).fill('Also typing');
 await expect(main.locator('.chat-typing')).toContainText('Reliable Peer');await expect(main.locator('.chat-typing')).toContainText('Typing Member');expect(typingRequests).toBe(1);await thirdContext.setOffline(true);await expect(main.locator('.chat-typing')).not.toContainText('Typing Member',{timeout:10000});
 // Delay the real server request, not its result or a Realtime event.
 let release:()=>void=()=>{};const held=new Promise<void>(resolve=>{release=resolve;});let intercepted=false;
 await peer.route('**/*',async route=>{const r=route.request();if(!intercepted&&r.method()==='POST'&&r.postData()?.includes('Committed after real delay')){intercepted=true;await held;}await route.continue();});
 await input.fill(`Committed after real delay @${member.username} `);await input.press('Enter');
 await expect(peerMain.locator('[data-pending-message-id]')).toHaveCount(1);const stableId=await peerMain.locator('[data-pending-message-id]').getAttribute('data-pending-message-id');
 release();await expect(otherDevice.locator(`.workspace-channel-row[href="/channels/${channel}"] .workspace-mentions`).first()).toHaveText('@1');await expect(peerMain.locator(`[data-message-id="${stableId}"]`)).toHaveCount(1);await expect(peerMain.locator('[data-pending-message-id]')).toHaveCount(0);
 await expect(main.getByRole('button',{name:/New Messages|Jump to latest/})).toBeVisible();expect(Math.abs(await list.evaluate(el=>el.scrollTop)-initialScroll)).toBeLessThan(8);
 await page.bringToFront();await main.getByRole('button',{name:/New Messages|Jump to latest/}).click();await expect(main.locator(`[data-message-id="${stableId}"]`)).toBeVisible();await expect(main.getByText('Unread history 85',{exact:true})).toHaveCount(1);await expect(otherDevice.locator(`.workspace-channel-row[href="/channels/${channel}"] .workspace-mentions`)).toHaveCount(0);await expect(otherDevice.locator(`.workspace-channel-row[href="/channels/${channel}"] .workspace-unread`)).toHaveCount(0);
 await peer.unroute('**/*');
 await context.setOffline(true);await input.fill('Offline retry stays unique');await input.press('Enter');await expect(peerMain.locator('[data-pending-message-id]')).toHaveCount(1);await expect(peerMain.getByRole('button',{name:'Retry message',exact:true})).toBeEnabled();
 const retryId=await peerMain.locator('[data-pending-message-id]').getAttribute('data-pending-message-id');await context.setOffline(false);await expect(peer.locator('.chat-connection')).toHaveText('● Live');await peerMain.getByRole('button',{name:'Retry message',exact:true}).click();
 await expect(main.locator(`[data-message-id="${retryId}"]`)).toHaveCount(1);await expect(peerMain.locator(`[data-message-id="${retryId}"]`)).toHaveCount(1);expect((await db.query('select count(*)::int n from public.messages where id=$1',[retryId])).rows[0].n).toBe(1);
 const mobile=test.info().project.name==='mobile';if(mobile)await page.getByRole('button',{name:'Open community members',exact:true}).click();
 const roster=page.locator('.workspace-member-list').filter({visible:true}),person=roster.getByRole('link',{name:'Reliable Peer',exact:true});await roster.getByRole('button',{name:'Refresh community members',exact:true}).click();await expect(person).toHaveAttribute('title','member · Online');
 expect((await client.rpc('community_presence_preference',{p_share:false})).error).toBeNull();await roster.getByRole('button',{name:'Refresh community members',exact:true}).click();await expect(person).toHaveAttribute('title','member · Status hidden');
 // Real heartbeat retries respect the existing six-per-minute budget; navigation/focus pulses may consume it.
 expect((await client.rpc('community_presence_preference',{p_share:true})).error).toBeNull();await expect.poll(async()=> (await peer.request.post('/api/people/data',{headers:{Origin:'http://127.0.0.1:4173'}})).status(),{timeout:70000,intervals:[2000,5000,15000]}).toBe(200);await roster.getByRole('button',{name:'Refresh community members',exact:true}).click();await expect(person).toHaveAttribute('title','member · Online');
 await page.context().setOffline(true);await expect(person).toHaveAttribute('title','member · Status unavailable');if(mobile)await page.getByRole('button',{name:'Close members',exact:true}).click();await input.fill('Missed while offline');await input.press('Enter');await expect(peerMain.locator('[data-message-id]').getByText('Missed while offline',{exact:true})).toBeVisible();await page.context().setOffline(false);await expect(page.locator('.chat-connection')).toHaveText('● Live');await expect(main.locator('[data-message-id]').getByText('Missed while offline',{exact:true})).toHaveCount(1);
 let unblock:()=>void=()=>{},capture:()=>void=()=>{},complete:()=>void=()=>{};const returned=new Promise<void>(resolve=>{complete=resolve;});const blocked=new Promise<void>(resolve=>{unblock=resolve;releaseCatchup=resolve;}),captured=new Promise<void>(resolve=>{capture=resolve;});let heldCatchup=false;
 await peer.route('**/*',async route=>{let args:unknown;try{args=JSON.parse(route.request().postData()??'null');}catch{/* Non-action requests have no JSON arguments. */}if(!heldCatchup&&Array.isArray(args)&&args.length===2&&args[0]===channel&&typeof args[1]==='string'&&/^\d+$/.test(args[1])){const response=await route.fetch();const containsPrivateMessage=(await response.text()).includes('Authorized before access revocation');if(containsPrivateMessage){heldCatchup=true;capture();await blocked;}await route.fulfill({response});if(containsPrivateMessage)complete();}else await route.continue();});
 const owner=userClient();await owner.auth.signInWithPassword({email:member.email,password:member.password});expect((await owner.rpc('send_channel_message',{p_id:randomUUID(),p_channel:channel,p_body:'Authorized before access revocation'})).error).toBeNull();await expect.poll(()=>heldCatchup).toBe(true);await captured;
 await db.query('delete from public.channel_permission_overrides where channel_id=$1 and user_id=$2',[channel,peerId]);await expect(peer.getByRole('heading',{name:'Channel access is unavailable',exact:true})).toBeVisible();unblock();await returned;await peer.unroute('**/*');await expect(peer.getByText('Missed while offline',{exact:true})).toHaveCount(0);await expect(peer.getByText('Authorized before access revocation',{exact:true})).toHaveCount(0);expect(errors).toEqual([]);
 }finally{releaseCatchup();await thirdContext.close();await device.close();await context.close();await db.query('delete from public.communities where id=$1',[community]);await db.end();if(peerId)await adminClient().auth.admin.deleteUser(peerId);if(thirdId)await adminClient().auth.admin.deleteUser(thirdId);}
});
test('a real five-thousand-message channel pages and virtualizes without moving the reader',async({memberPage:page,member})=>{
 test.setTimeout(180000);const connectionString=readFileSync('.local-stack/database-url','utf8').trim();if(!['localhost','127.0.0.1'].includes(new URL(connectionString).hostname))throw Error('Local only');const db=new pg.Client({connectionString});await db.connect();const community=randomUUID(),channel=randomUUID();
 try{
 await db.query("insert into public.communities(id,slug,name,visibility) values($1,$2,'Long history','private')",[community,`long-${community}`]);await db.query("insert into public.community_members(community_id,user_id,role_id) values($1,$2,'owner')",[community,member.id]);await db.query("insert into public.channels(id,community_id,name) values($1,$2,'long-chat')",[channel,community]);
 await db.query("insert into public.messages(id,channel_id,author_id,body) select gen_random_uuid(),$1,$2,'History row '||i||' '||repeat('Gaming together. ',i%5) from generate_series(1,5000)i",[channel,member.id]);
 await page.goto(`/channels/${channel}`);await expect(page.locator('.chat-connection')).toHaveText('● Live');const main=page.getByRole('region',{name:'Channel conversation',exact:true}),timeline=main.locator('.message-timeline'),list=main.getByLabel('Channel messages',{exact:true});
 await expect(timeline).toHaveAttribute('data-loaded-count','40');for(let i=0;i<25;i++){await main.getByRole('button',{name:'Load older messages',exact:true}).click();await expect(timeline).toHaveAttribute('data-loaded-count',String(80+i*40));}
 await expect(timeline).toHaveAttribute('data-virtualized','true');expect(await main.locator('[data-message-id]').count()).toBeLessThan(100);
 await list.evaluate(el=>{el.scrollTop=el.scrollHeight/2;});await expect.poll(()=>main.locator('[data-message-id]').count()).toBeGreaterThan(1);
 const position=await list.evaluate(el=>{const top=el.getBoundingClientRect().top;const row=Array.from(el.querySelectorAll<HTMLElement>('[data-message-id]')).find(r=>r.getBoundingClientRect().bottom>top)!;return{id:row.id,offset:row.getBoundingClientRect().top-top};});
 await main.getByRole('button',{name:'Load older messages',exact:true}).evaluate(button=>(button as HTMLButtonElement).click());await expect(timeline).toHaveAttribute('data-loaded-count','1080');
 const prependedOffset=await list.evaluate((el,p)=>document.getElementById(p.id)!.getBoundingClientRect().top-el.getBoundingClientRect().top,position);expect(Math.abs(prependedOffset-position.offset)).toBeLessThan(8);
 const client=userClient();await client.auth.signInWithPassword({email:member.email,password:member.password});const id=randomUUID();expect((await client.rpc('send_channel_message',{p_id:id,p_channel:channel,p_body:'Live after five thousand'})).error).toBeNull();await expect(main.getByRole('button',{name:/New Messages/})).toBeVisible();
 const offset=await list.evaluate((el,p)=>document.getElementById(p.id)!.getBoundingClientRect().top-el.getBoundingClientRect().top,position);expect(Math.abs(offset-position.offset)).toBeLessThan(8);expect(await main.locator('[data-message-id]').count()).toBeLessThan(100);
 await main.getByRole('button',{name:/New Messages/}).click();await expect(main.locator(`[data-message-id="${id}"]`)).toBeVisible();await expect(timeline).toHaveAttribute('data-loaded-count','40');
 await page.context().setOffline(true);await expect(page.locator('.chat-connection')).toHaveText('Offline');
 // Commit a real database backlog while the authenticated browser is disconnected.
 await db.query("insert into public.messages(id,channel_id,author_id,body) select gen_random_uuid(),$1,$2,'Missed committed row '||i from generate_series(1,4205)i",[channel,member.id]);
 await page.context().setOffline(false);await expect(page.locator('.chat-connection')).toHaveText('● Live',{timeout:45000});await expect(main.locator('[data-message-id]').getByText('Missed committed row 4205',{exact:true})).toBeVisible();await expect(timeline).toHaveAttribute('data-loaded-count','4245');expect(await main.locator('[data-message-id]').count()).toBeLessThan(100);
 }finally{await db.query('delete from public.communities where id=$1',[community]);await db.end();}
});
