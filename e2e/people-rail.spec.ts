import { test, expect, adminClient, signIn } from "./helpers";
import pg from "pg";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
test("simple people rail opens private member profiles for real friendship and respects community presence",async({memberPage:page,member,browser})=>{
 test.setTimeout(120000);
 const db=new pg.Client({connectionString:readFileSync('.local-stack/database-url','utf8').trim()});await db.connect();
 const community=randomUUID(),channel=randomUUID(),suffix=randomUUID().slice(0,8),username='railpeer_'+suffix,email=`rail-${suffix}@example.test`,password=`Gathering-${randomUUID()}`;
 const admin=adminClient(),created=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{date_of_birth:'1990-01-01'}});if(created.error||!created.data.user)throw Error('Fixture failed');const peer=created.data.user.id;
 const second=await browser.newContext({baseURL:'http://127.0.0.1:4173'}),peerPage=await second.newPage();
 try{
  await db.query("update public.profiles set username=$2,display_name='Rail Friend',bio='Private biography must stay hidden',onboarding_completed_at=now(),visibility='private' where id=$1",[peer,username]);
  await db.query("insert into public.communities(id,slug,name,visibility) values($1,$2,'Rail friendship','private')",[community,'rail-'+suffix]);
  await db.query("insert into public.community_members(community_id,user_id,role_id) values($1,$2,'owner'),($1,$3,'member')",[community,member.id,peer]);
  await db.query("insert into public.channels(id,community_id,name) values($1,$2,'rail-general')",[channel,community]);
  await signIn(peerPage,email,password);await peerPage.goto('/messages?tab=privacy');
  const preference=peerPage.getByRole('checkbox',{name:'Share online status with fellow community members',exact:true});await expect(preference).toBeEnabled();await expect(preference).toBeChecked();await preference.click();await expect(preference).not.toBeChecked();await preference.click();await expect(peerPage.getByText('Community presence saved.')).toBeVisible();
  await page.goto(`/channels/${channel}`);
  if(test.info().project.name==='desktop'){
   const rail=page.getByRole('complementary',{name:'Community activity'}),online=rail.getByRole('region',{name:'Online members',exact:true});
   const row=online.getByRole('link',{name:'Rail Friend',exact:true});await expect(row).toBeVisible();await expect(row).toHaveText('RRail Friend');await expect(rail.getByRole('button',{name:'Add friend'})).toHaveCount(0);await row.click();
  }else await page.goto(`/members/${peer}`);
  await expect(page.getByRole('heading',{name:'Rail Friend',exact:true})).toBeVisible();await expect(page.getByText('Private biography must stay hidden')).toHaveCount(0);await expect(page.getByText('Profile details are private.',{exact:false})).toBeVisible();
  await page.getByRole('button',{name:'Add friend',exact:true}).click();await expect(page.getByText('Request sent',{exact:true})).toBeVisible();
  await peerPage.goto(`/members/${member.id}`);await peerPage.getByRole('button',{name:'Accept request',exact:true}).click();await expect(page.getByRole('button',{name:'Remove friend',exact:true})).toBeVisible();
  if(test.info().project.name==='desktop'){
   await page.goto('/home');const rail=page.getByRole('complementary',{name:'Community activity'});
   await expect(rail.getByRole('region',{name:'Friends',exact:true}).getByRole('link',{name:'Rail Friend',exact:true})).toBeVisible();await expect(rail.getByRole('region',{name:'Online members',exact:true}).getByRole('link',{name:'Rail Friend',exact:true})).toHaveCount(0);
  }
  const scan=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();expect(scan.violations.map(v=>v.id)).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
  await peerPage.goto('/messages?tab=privacy');await peerPage.getByRole('checkbox',{name:'Share online status with fellow community members',exact:true}).click();await expect(peerPage.getByText('Community presence saved.')).toBeVisible();await peerPage.reload();await expect(peerPage.getByRole('checkbox',{name:'Share online status with fellow community members',exact:true})).not.toBeChecked();
  await db.query("insert into public.member_blocks(blocker_id,blocked_id,label) values($1,$2,'Blocked')",[peer,member.id]);await page.goto(`/members/${peer}`);await expect(page.getByRole('heading',{name:'Member unavailable',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Add friend'})).toHaveCount(0);
 }finally{await second.close();await db.query('delete from public.communities where id=$1',[community]);await db.end();await admin.auth.admin.deleteUser(peer);}
});
