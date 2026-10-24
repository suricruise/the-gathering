import { test, expect, adminClient, signIn } from "./helpers";
import pg from "pg";import{readFileSync}from"node:fs";import{randomUUID}from"node:crypto";
import AxeBuilder from "@axe-core/playwright";
test("community member lists make private-peer friendship easy and preserve blocks and DM consent",async({memberPage:page,member,browser})=>{
 test.setTimeout(120000);page.setDefaultTimeout(20000);
 const db=new pg.Client({connectionString:readFileSync('.local-stack/database-url','utf8').trim()});await db.connect();
 const community=randomUUID(),channel=randomUUID(),suffix=randomUUID().slice(0,8),username='peer_'+suffix,email=`directory-${suffix}@example.test`,password=`Gathering-${randomUUID()}`;
 const admin=adminClient(),created=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{date_of_birth:'1990-01-01'}});if(created.error||!created.data.user)throw Error('Fixture failed');const peer=created.data.user.id;
 const second=await browser.newContext({baseURL:"http://127.0.0.1:4173"});const friendPage=await second.newPage();friendPage.setDefaultTimeout(20000);
 try{
  await db.query("update public.profiles set username=$2,display_name='Community Friend',onboarding_completed_at=now(),visibility='private' where id=$1",[peer,username]);
  await db.query("insert into public.communities(id,slug,name,visibility) values($1,$2,'Friendship community','private')",[community,'dir-'+suffix]);
  await db.query("insert into public.community_members(community_id,user_id,role_id) values($1,$2,'owner'),($1,$3,'member')",[community,member.id,peer]);
  await db.query("insert into public.channels(id,community_id,name) values($1,$2,'general')",[channel,community]);
  await page.goto('/home');
  if(test.info().project.name==='mobile')await page.getByRole('button',{name:'Open all pages'}).click();
  await page.getByRole('link',{name:'Members',exact:true}).click();
  await page.getByRole('combobox',{name:'Community',exact:true}).selectOption(community);await page.getByRole('button',{name:'Show members',exact:true}).click();
  const card=page.locator('article').filter({has:page.getByRole('heading',{name:'Community Friend',exact:true})});
  await expect(card).toBeVisible();await expect(card).toContainText('Profile private');await expect(card).toContainText('Status private');await expect(card.getByRole('button',{name:'Message',exact:true})).toHaveCount(0);
  await page.getByLabel('Search community members').fill('@'+username);await page.getByRole('button',{name:'Search members',exact:true}).click();await expect(card).toBeVisible();
  await card.getByRole('button',{name:'Add friend',exact:true}).click();await expect(card).toContainText('Request sent');
  await card.getByRole('button',{name:'Cancel request',exact:true}).click();await expect(card.getByRole('button',{name:'Add friend',exact:true})).toBeVisible();
  await card.getByRole('button',{name:'Add friend',exact:true}).click();await expect(card).toContainText('Request sent');
  await signIn(friendPage,email,password);await friendPage.goto('http://127.0.0.1:4173/messages');await friendPage.getByRole('button',{name:'Accept request',exact:true}).click();
  await expect(card).toContainText('Friends');await expect(card.getByRole('button',{name:'Message',exact:true})).toBeVisible();
  await page.getByRole('combobox',{name:'Community role',exact:true}).selectOption('moderator');await expect(page.getByText('No members match these filters.')).toBeVisible();await page.getByRole('combobox',{name:'Community role',exact:true}).selectOption('all');await expect(card).toBeVisible();
  const scan=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();expect(scan.violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)}))).toEqual([]);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
  await card.getByRole('button',{name:'Message',exact:true}).click();await expect(page).toHaveURL(/\/messages\/[a-f0-9-]+/);
  await page.goto(`/channels/${channel}`);await expect(page.getByRole('link',{name:'Browse community members · Add friends'})).toBeVisible();
  if(test.info().project.name==='desktop'){
   const rail=page.getByRole('complementary',{name:'Community members',exact:true});await expect(rail.getByRole('heading',{name:'Community Friend'})).toBeVisible();
  }
  await page.getByRole('link',{name:'Browse community members · Add friends'}).click();await expect(card).toBeVisible();
  await card.getByText('More actions',{exact:true}).click();page.once('dialog',dialog=>dialog.accept());await card.getByRole('button',{name:'Block member',exact:true}).click();await expect(card).toHaveCount(0);
  await friendPage.goto(`http://127.0.0.1:4173/members?community=${community}`);await expect(friendPage.getByRole('heading',{name:/Community Friend/})).toBeVisible();await expect(friendPage.getByRole('heading',{name:'Jordan Rivers',exact:true})).toHaveCount(0);
  await db.query("update public.community_members set status='banned',role_id='member' where community_id=$1 and user_id=$2",[community,member.id]);
  await page.goto(`/members?community=${community}`);await expect(page.getByRole('heading',{name:'Community Friend',exact:true})).toHaveCount(0);
 }finally{await second.close();await db.query('delete from public.communities where id=$1',[community]);await db.end();await admin.auth.admin.deleteUser(peer);}
});
