import { test, expect } from "./helpers";
import pg from "pg";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
test("platform community management orders Home and Discover and confirms permanent deletion", async ({ memberPage: page, member }) => {
 test.setTimeout(120000);
 const db=new pg.Client({connectionString:readFileSync(".local-stack/database-url","utf8").trim()});await db.connect();
 const first=randomUUID(),second=randomUUID(),slug="manage-"+first.slice(0,8);
 const label="ZZZ preferred "+first.slice(0,8), other="AAA following "+second.slice(0,8);
 try{
  await db.query("insert into private.platform_roles(user_id,role) values($1,'administrator')",[member.id]);
  await db.query("insert into public.communities(id,slug,name,visibility,display_order) values($1,$2,$3,'private',999999),($4,$5,$6,'private',1)",[first,slug,label,second,"manage-"+second.slice(0,8),other]);
  await db.query("insert into public.community_members(community_id,user_id,role_id) values($1,$3,'owner'),($2,$3,'owner')",[first,second,member.id]);
  await page.goto("/admin");await page.getByRole("button",{name:"Communities",exact:true}).click();
  const card=page.locator("article").filter({has:page.getByRole("heading",{name:label,exact:true})});
  await card.getByText("Display order",{exact:true}).click();
  await card.getByLabel("Community display position").fill("0");
  const order=card.locator("details").filter({has:page.getByText("Display order",{exact:true})});
  await order.getByLabel("Reason for this action").fill("Place this community first.");
  await order.getByRole("button",{name:"Save display order"}).click();
  await expect(page.getByRole("status").filter({hasText:"Saved."})).toBeVisible();
  for(const route of ["/home","/communities"]){await page.goto(route);const names=page.locator(route==="/home"?".home-section:has(h2:text-is(\"My communities\")) article":".community-grid article").filter({has:page.getByRole("heading",{name:new RegExp(`${label}|${other}`)})});await expect(names).toHaveCount(2);await expect(names.first()).toContainText(label);}
  await page.goto("/admin");await page.getByRole("button",{name:"Communities",exact:true}).click();
  await card.locator("summary").filter({hasText:"Permanently delete community"}).click();
  const deletion=card.locator("details").filter({has:page.getByText("Permanently delete community",{exact:true})});
  await deletion.getByLabel("Community address to confirm deletion").fill("wrong-community");
  await deletion.getByLabel("Reason for this action").fill("Approved permanent fixture removal.");
  await deletion.getByRole("button",{name:"Permanently delete community",exact:true}).click();
  await expect(deletion.getByRole("alert")).toBeVisible();
  expect((await db.query("select id from public.communities where id=$1",[first])).rowCount).toBe(1);
  await deletion.getByLabel("Community address to confirm deletion").fill(slug);
  await deletion.getByRole("button",{name:"Permanently delete community",exact:true}).click();
  await expect(page.getByRole("status").filter({hasText:"Saved."})).toBeVisible();
  await expect(card).toHaveCount(0);
  for(const route of ["/home","/communities"]){await page.goto(route);await expect(page.getByRole("heading",{name:label,exact:true})).toHaveCount(0);}
  await page.goto(`/communities/${slug}`);
  // Next.js streamed notFound() responses may have HTTP 200; verify the actual
  // denied/not-found UI and noindex behavior, plus the committed deletion above.
  await expect(page.getByRole("heading",{name:"A little off the map"})).toBeVisible();
  await expect(page.locator('meta[name="robots"]').first()).toHaveAttribute("content",/noindex/);
  await expect(page.getByRole("heading",{name:label,exact:true})).toHaveCount(0);
  expect((await db.query("select id from private.admin_audit where target_id=$1 and action='community_delete'",[first])).rowCount).toBe(1);
 }finally{await db.query("delete from public.communities where id=any($1::uuid[])",[[first,second]]);await db.query("delete from private.platform_roles where user_id=$1",[member.id]);await db.end();}
});
