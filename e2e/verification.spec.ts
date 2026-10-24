import { test, expect, localStack, adminClient, verificationLink } from "./helpers";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import pg from "pg";
import AxeBuilder from "@axe-core/playwright";
test("email verification works in a fresh browser and incomplete profiles have clear admin labels",async({memberPage:adminPage,member,browser})=>{
 test.skip(!localStack,"Local Auth and Mailpit only.");
 const db=new pg.Client({connectionString:readFileSync(".local-stack/database-url","utf8").trim()});await db.connect();
 const suffix=randomUUID().slice(0,8),email=`verify-${suffix}@example.test`,password=`Join-${randomUUID()}`;
 const signup=await browser.newContext(),emailBrowser=await browser.newContext(),repeatBrowser=await browser.newContext();let id:string|undefined;
 try{
  const page=await signup.newPage();await page.goto("http://127.0.0.1:4173/register");
  await page.getByLabel("Email address").fill(email);await page.getByLabel(/^Password/).fill(password);await page.getByLabel("Date of birth").fill("1994-01-01");await page.getByRole("checkbox",{name:/at least 18/}).check();await page.getByRole("button",{name:"Create account"}).click();
  await expect(page.getByRole("status")).toContainText("verification link");
  const original=await verificationLink(email);
  id=(await adminClient().auth.admin.listUsers()).data.users.find(user=>user.email===email)?.id;expect(id).toBeTruthy();
  await expect.poll(async()=>(await db.query("select confirmation_sent_at<now()-interval '1100 milliseconds' ready from auth.users where id=$1",[id])).rows[0].ready).toBe(true);
  await page.goto("http://127.0.0.1:4173/verify-email");await page.getByLabel("Email address").fill(email);await page.getByRole("button",{name:"Resend verification email"}).click();await expect(page.getByRole("status")).toContainText("If this address has an account awaiting verification");
  let resent=original;
  await expect.poll(async()=>{resent=await verificationLink(email);return resent!==original;},{timeout:15000}).toBe(true);
  const delivered=new URL(resent);
  // Docker Auth sends the default provider URL. Its token is the same TokenHash
  // used by our supplied cross-browser template; exercise that app route directly.
  const hash=delivered.searchParams.get("token_hash") || delivered.searchParams.get("token");expect(hash).toBeTruthy();
  const link=new URL("/auth/confirm","http://127.0.0.1:4173");link.searchParams.set("token_hash",hash!);link.searchParams.set("type","email");
  await db.query("insert into private.platform_roles(user_id,role) values($1,'administrator')",[member.id]);
  await adminPage.goto("/admin");await adminPage.getByRole("button",{name:"Members",exact:true}).click();
  const row=adminPage.locator("article").filter({has:adminPage.locator("code").filter({hasText:id!})});
  await expect(row.getByRole("heading",{name:"Profile setup pending"})).toBeVisible();await expect(row).toContainText("No username selected");await expect(row).toContainText("Account: active");await expect(row).not.toContainText(email);
  const fresh=await emailBrowser.newPage();expect((await emailBrowser.cookies()).length).toBe(0);await fresh.goto(link.href);
  await expect(fresh).toHaveURL(/\/onboarding$/);await expect(fresh.getByLabel("Display name",{exact:true})).toBeVisible();
  expect((await adminClient().auth.admin.getUserById(id!)).data.user?.email_confirmed_at).toBeTruthy();
  const repeated=await repeatBrowser.newPage();await repeated.goto(link.href);await expect(repeated).toHaveURL(/\/verify-email\?reason=invalid/);
  await expect(repeated.getByRole("heading",{name:"Finish verifying your email."})).toBeVisible();
  await expect(repeated.getByRole("link",{name:"Already verified? Sign in"})).toBeVisible();
  await repeated.getByRole("link",{name:"Already verified? Sign in"}).click();await repeated.getByLabel("Email address").fill(email);await repeated.getByLabel("Password",{exact:true}).fill(password);await repeated.getByRole("button",{name:"Sign in",exact:true}).click();await expect(repeated).toHaveURL(/\/onboarding$/);
 }finally{await signup.close();await emailBrowser.close();await repeatBrowser.close();await db.query("delete from private.platform_roles where user_id=$1",[member.id]);await db.end();if(id)await adminClient().auth.admin.deleteUser(id);}
});
test("broken confirmation and callback links show accessible recovery instructions",async({page})=>{
 const response=await page.goto("/auth/confirm?token_hash=invalid&type=administrator");expect(response?.status()).toBe(200);await expect(page).toHaveURL(/\/verify-email\?reason=invalid/);
 await expect(page.getByRole("alert").filter({hasText:"expired or already used"})).toBeVisible();await expect(page.getByRole("button",{name:"Resend verification email"})).toBeVisible();
 await page.getByLabel("Email address").fill(`unknown-${randomUUID().slice(0,8)}@example.test`);await page.getByRole("button",{name:"Resend verification email"}).click();await expect(page.getByRole("status")).toContainText("If this address has an account awaiting verification");
 await expect(page).toHaveTitle(/Email verification help/);
 const result=await new AxeBuilder({page}).withTags(["wcag2a","wcag2aa","wcag21aa"]).analyze();expect(result.violations.map(v=>v.id)).toEqual([]);
 await page.goto("/verify-email?reason=__proto__");await expect(page.getByRole("heading",{name:"Finish verifying your email."})).toBeVisible();
 await page.goto("/auth/callback");await expect(page).toHaveURL(/\/verify-email\?reason=invalid/);await expect(page.getByRole("heading",{name:"Finish verifying your email."})).toBeVisible();
});

test("legacy PKCE email opened without the originating cookie offers sign-in and preserves verification",async({page,browser})=>{
 test.skip(!localStack,"Local Auth and Mailpit only.");
 const suffix=randomUUID().slice(0,8),email=`pkce-${suffix}@example.test`,password=`Join-${randomUUID()}`;
 const second=await browser.newContext();let id:string|undefined;
 try{
  await page.goto("/register");await page.getByLabel("Email address").fill(email);await page.getByLabel(/^Password/).fill(password);await page.getByLabel("Date of birth").fill("1994-01-01");await page.getByRole("checkbox",{name:/at least 18/}).check();await page.getByRole("button",{name:"Create account"}).click();await expect(page.getByRole("status")).toContainText("verification link");
  const delivered=new URL(await verificationLink(email));
  id=(await adminClient().auth.admin.listUsers()).data.users.find(user=>user.email===email)?.id;
  const hash=delivered.searchParams.get("token_hash") || delivered.searchParams.get("token");expect(hash).toBeTruthy();
  const legacy=new URL("/auth/v1/verify",process.env.NEXT_PUBLIC_SUPABASE_URL!);legacy.searchParams.set("token",hash!);legacy.searchParams.set("type","signup");legacy.searchParams.set("redirect_to","http://127.0.0.1:4173/auth/callback");
  const fresh=await second.newPage();await fresh.goto(legacy.href);await expect(fresh).toHaveURL(/\/verify-email\?reason=browser/);
  await expect(fresh.getByRole("alert").filter({hasText:"same browser"})).toBeVisible();expect((await adminClient().auth.admin.getUserById(id!)).data.user?.email_confirmed_at).toBeTruthy();
  await fresh.getByRole("link",{name:"Already verified? Sign in"}).click();await fresh.getByLabel("Email address").fill(email);await fresh.getByLabel("Password",{exact:true}).fill(password);await fresh.getByRole("button",{name:"Sign in",exact:true}).click();await expect(fresh).toHaveURL(/\/onboarding$/);
 }finally{await second.close();if(!id)id=(await adminClient().auth.admin.listUsers()).data.users.find(user=>user.email===email)?.id;if(id)await adminClient().auth.admin.deleteUser(id);}
});
