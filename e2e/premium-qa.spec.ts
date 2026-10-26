import {test,expect,userClient} from './helpers';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import AxeBuilder from '@axe-core/playwright';
// All fixtures are isolated, explicitly labelled local QA content, never production data.
test('premium final QA captures authorized major routes at desktop, tablet and mobile widths',async({memberPage:page,member},info)=>{
 test.setTimeout(300000);
 const url=readFileSync('.local-stack/database-url','utf8').trim();if(!['localhost','127.0.0.1'].includes(new URL(url).hostname))throw Error('Local only');
 const db=new pg.Client({connectionString:url});await db.connect();const community=randomUUID(),text=randomUUID(),voice=randomUUID(),category=randomUUID(),event=randomUUID(),slug='visual-'+community.slice(0,8);
 const captureDir=process.env.PREMIUM_VISUAL_OUTPUT||'docs/qa/premium';
 const mobile=info.project.name==='mobile',widths=mobile?[390]:[1440,1024],errors:string[]=[],observations:unknown[]=[];
 page.on('pageerror',e=>errors.push(e.message));
 try{
 await db.query("insert into public.communities(id,slug,name,description,visibility,interest_category,cover)values($1,$2,'QA Shared Stories','Local QA fixture: conversation, creativity and community.','public','conversation','aurora')",[community,slug]);
 await db.query("insert into public.community_members(community_id,user_id,role_id)values($1,$2,'owner')",[community,member.id]);
 await db.query("insert into public.channel_categories(id,community_id,name)values($1,$2,'Conversations')",[category,community]);
 await db.query("insert into public.channels(id,community_id,category_id,name,description,kind)values($1,$3,$4,'conversation','Local QA conversation topic','text'),($2,$3,$4,'casual-hangout','Local QA voice room; connect only through real LiveKit.','voice')",[text,voice,community,category]);
 await db.query("insert into public.events(id,community_id,host_id,title,description,kind,banner,starts_at,ends_at,time_zone)values($1,$2,$3,'QA Conversation Gathering','Local QA event fixture.','discussion','aurora',now()+interval '2 days',now()+interval '2 days 1 hour','America/New_York')",[event,community,member.id]);
 await db.query("insert into private.platform_roles(user_id,role)values($1,'administrator')",[member.id]);
 const client=userClient();await client.auth.signInWithPassword({email:member.email,password:member.password});
 expect((await client.rpc('send_channel_message',{p_id:randomUUID(),p_channel:text,p_body:'Local QA fixture — a real saved conversation message, not a production member post.'})).error).toBeNull();
 const routes=[['home','/home'],['explore','/communities'],['community',`/communities/${slug}`],['chat',`/channels/${text}`],['hangouts','/voice'],['voice-room',`/channels/${voice}`],['profile',`/members/${member.id}`],['profile-editor','/profile'],['people','/messages?tab=discover'],['messages','/messages?tab=conversations'],['events','/events'],['event',`/events/${event}`],['notifications','/notifications'],['settings','/settings'],['admin','/admin'],['faith','/faith'],['social','/feed'],['squad-up','/squad-up']];
 mkdirSync(captureDir,{recursive:true});
 for(const width of widths){
  await page.setViewportSize({width,height:width===390?844:1000});
  for(const [name,path]of routes){
   const start=Date.now();await page.goto(path);await expect(page.locator('main h1')).toBeVisible();await page.evaluate(()=>document.fonts.ready);
   let heroContrast:number|null=null;
   if(name==='home'||name==='hangouts'){
    heroContrast=await page.evaluate(()=>{
     const hero=document.querySelector('.lounge-hero, .hangouts-hero')!,copy=hero.querySelector('.lounge-hero-copy')||hero.firstElementChild!,text=hero.querySelector('p')!;
     const overlay=getComputedStyle(hero,'::before'),foreground=getComputedStyle(text).color.match(/[\d.]+/g)!.map(Number);
     if(Number(overlay.zIndex)<1||Number(getComputedStyle(copy).zIndex)<=Number(overlay.zIndex))return 0;
     const colors=overlay.backgroundImage.match(/rgba?\([^)]+\)/g)||[];
     const light=(c:number[])=>c.slice(0,3).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
     return colors.length?Math.min(...colors.map(color=>{const c=color.match(/[\d.]+/g)!.map(Number),alpha=c[3]??1;const worst=c.slice(0,3).map(v=>v*alpha+255*(1-alpha));const a=light(foreground),b=light(worst);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);})):0;
    });
    expect(heroContrast,'body copy contrast even over white artwork beneath the actual scrim').toBeGreaterThanOrEqual(4.5);
   }
   if(name==='chat'){await expect(page.locator('.chat-connection')).toHaveText('● Live');await expect(page.getByText('Local QA fixture — a real saved conversation message, not a production member post.',{exact:true})).toBeVisible();const composer=page.locator('.chat-composer').first();await expect(composer).toBeInViewport();expect(await composer.evaluate(el=>el.getBoundingClientRect().bottom<=innerHeight+2)).toBe(true);}
   if(name==='admin'){await expect(page.getByText('Platform administrator',{exact:true})).toBeVisible();await expect(page.getByText('messages 7d',{exact:true})).toBeVisible();}
   if(name==='people'||name==='messages')expect(await page.evaluate(()=>{const block=document.querySelector('.people-page>.page-heading')!;const rows=['.eyebrow','h1','p'].map(s=>block.querySelector(s)!.getBoundingClientRect());return rows.every((r,i)=>i===0||r.top>=rows[i-1].bottom-1);}),'People heading remains vertical at every width').toBe(true);
   if(name==='voice-room'){await expect(page.getByRole('button',{name:'Search messages',exact:true})).toHaveCount(0);await expect(page.getByText('Navigation preferences unavailable.',{exact:true})).toHaveCount(0);}
   expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),`${name} overflow at ${width}`).toBe(false);
   const axe=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();expect(axe.violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)})),`${name} accessibility at ${width}`).toEqual([]);
   const loaded=await page.locator('main img').evaluateAll(images=>images.filter(i=>i instanceof HTMLImageElement&&i.complete&&i.naturalWidth===0).length);expect(loaded,`${name} broken image at ${width}`).toBe(0);
   await page.screenshot({path:`${captureDir}/${width}-${name}.jpg`,type:'jpeg',quality:75});
   const timing=await page.evaluate(()=>{const n=performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming|undefined;return {ttfb:n?Math.round(n.responseStart-n.requestStart):null,dom:n?Math.round(n.domContentLoadedEventEnd-n.startTime):null};});
   observations.push({width,page:name,heroContrastConservative:heroContrast,...timing,totalWithAxeAndScreenshotMs:Date.now()-start});
  }
  await page.emulateMedia({colorScheme:'light'});await page.goto('/home');expect(await page.evaluate(()=>getComputedStyle(document.documentElement).colorScheme)).toBe('dark');await page.emulateMedia({colorScheme:'dark'});
 }
 writeFileSync(`${captureDir}/${mobile?'mobile':'desktop-tablet'}-timings.json`,JSON.stringify(observations,null,2)+'\n');expect(errors).toEqual([]);
 }finally{await db.query('delete from private.platform_roles where user_id=$1',[member.id]);await db.query('delete from public.communities where id=$1',[community]);await db.end();}
});
