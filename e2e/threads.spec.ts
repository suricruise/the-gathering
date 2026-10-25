import { test, expect, adminClient, userClient, signIn } from "./helpers";
import type { Locator } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import pg from "pg";
import AxeBuilder from "@axe-core/playwright";
test("threads keep the channel visible, page safely, isolate composers and deliver real private replies", async ({ memberPage: page, member, browser }) => {
  test.setTimeout(180000);
  const connectionString = readFileSync(".local-stack/database-url", "utf8").trim();
  if (!["localhost", "127.0.0.1"].includes(new URL(connectionString).hostname)) throw Error("Local only");
  const db = new pg.Client({ connectionString }); await db.connect();
  const community = randomUUID(), channel = randomUUID(), alpha = randomUUID(), beta = randomUUID(), suffix = randomUUID().slice(0,8);
  const email = `threads-${suffix}@example.test`, password = `Gathering-${randomUUID()}`;
  const mobile = test.info().project.name === "mobile";
  const context = await browser.newContext({ baseURL: "http://127.0.0.1:4173", viewport: page.viewportSize()! }); const peer = await context.newPage();
  let peerId: string | undefined;
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message)); peer.on("pageerror", error => errors.push(error.message));
  async function actions(article: Locator) { if(await article.locator(".chat-message-menu").getAttribute("open") === null) await article.getByLabel("Message actions", { exact: true }).click(); }
  async function openRoot(id: string) { const article = page.locator(`[data-message-id="${id}"]`); await actions(article); await article.getByRole("button", { name: "Reply in Thread", exact: true }).click(); }
  try {
    const created = await adminClient().auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { date_of_birth: "1990-01-01" } }); expect(created.error).toBeNull(); peerId = created.data.user!.id;
    const client = userClient(); await client.auth.signInWithPassword({ email, password });
    expect((await client.rpc("save_my_profile", { p_username: `thread_${suffix}`, p_display_name: "Thread Peer", p_bio: "", p_visibility: "private", p_interests: ["co-op"], p_games: ["minecraft"], p_platforms: ["pc"], p_complete: true })).data).toBe(true);
    await db.query("insert into public.communities(id,slug,name,visibility) values($1,$2,'Thread workspace','private')", [community,`threads-${suffix}`]);
    await db.query("insert into public.community_members(community_id,user_id,role_id) values($1,$2,'owner'),($1,$3,'member')", [community,member.id,peerId]);
    await db.query("insert into public.channels(id,community_id,name,is_private) values($1,$2,'thread-chat',true)", [channel,community]);
    await db.query('insert into public.channel_permission_overrides(community_id,channel_id,user_id,can_view,can_post) values($1,$2,$3,true,true)', [community,channel,peerId]);
    await db.query("insert into public.messages(id,channel_id,author_id,body) select gen_random_uuid(),$1,$2,repeat('Earlier channel history. ',12)||i from generate_series(1,6)i", [channel,member.id]);
    await db.query("insert into public.messages(id,channel_id,author_id,body) values($1,$3,$4,'Thread alpha original'),($2,$3,$4,'Thread beta original')", [alpha,beta,channel,member.id]);
    await db.query("insert into public.messages(id,channel_id,author_id,parent_id,reply_to_id,body) select gen_random_uuid(),$1,$2,$3,$3,'Historical reply '||i from generate_series(1,65)i", [channel,peerId,alpha]);
    await db.query("insert into public.messages(id,channel_id,author_id,body) select gen_random_uuid(),$1,$2,repeat('Later channel history. ',12)||i from generate_series(1,6)i", [channel,member.id]);
    await signIn(peer,email,password); await Promise.all([page.goto(`/channels/${channel}`),peer.goto(`/channels/${channel}`)]);
    for (const p of [page,peer]) await expect(p.locator('.chat-connection')).toHaveText('● Live');
    const main = page.getByRole('region',{name:'Channel conversation',exact:true}), thread = page.getByRole('region',{name:'Message thread',exact:true});
    await main.getByRole('textbox',{name:'Message thread-chat',exact:true}).fill('Main draft stays here');
    const article = page.locator(`[data-message-id="${alpha}"]`); await actions(article);
    const replyAction=article.getByRole('button',{name:'Reply in Thread',exact:true});
    // Establish the position after the browser brings the action into view.
    await replyAction.scrollIntoViewIfNeeded();
    const channelList = main.getByLabel('Channel messages',{exact:true});
    const position = await channelList.evaluate(element => { const top=element.getBoundingClientRect().top; const first=Array.from(element.querySelectorAll<HTMLElement>('.chat-message')).find(row=>row.getBoundingClientRect().bottom>top)!; return { id:first.id, offset:first.getBoundingClientRect().top-top }; });
    await replyAction.click();
    await expect(thread).toBeVisible(); await expect(thread.locator('.thread-original')).toContainText('Thread alpha original');
    if(mobile) await expect(main).toBeHidden(); else { await expect(main).toBeVisible(); const mainBox=await main.boundingBox(),threadBox=await thread.boundingBox(); expect(threadBox!.x).toBeGreaterThan(mainBox!.x); }
    await expect(thread.locator('[data-thread-message-id]')).toHaveCount(41);
    await expect(thread.getByText('Historical reply 1',{exact:true})).toHaveCount(0);
    await thread.getByRole('button',{name:'Load older replies',exact:true}).click();
    await expect(thread.getByText('Historical reply 1',{exact:true})).toHaveCount(1);
    await expect(thread.locator('[data-thread-message-id]')).toHaveCount(66);
    const oldestReplyId = await thread.getByText('Historical reply 1',{exact:true}).evaluate(element => element.closest('article')!.getAttribute('data-thread-message-id'));
    await thread.getByRole('textbox',{name:'Thread reply',exact:true}).fill('Draft in alpha');
    await thread.getByRole('button',{name:'Back to channel',exact:true}).click();
    await expect(main.getByRole('textbox',{name:'Message thread-chat',exact:true})).toHaveValue('Main draft stays here');
    const restored = await channelList.evaluate((element, anchor) => document.getElementById(anchor.id)!.getBoundingClientRect().top-element.getBoundingClientRect().top,position);
    expect(Math.abs(restored-position.offset)).toBeLessThan(5);
    await openRoot(alpha); await expect(thread.getByRole('textbox',{name:'Thread reply',exact:true})).toHaveValue('Draft in alpha');
    const peerRoot=peer.locator(`[data-message-id="${alpha}"]`); await actions(peerRoot); await peerRoot.getByRole('button',{name:'Reply in Thread',exact:true}).click();
    const peerThread=peer.getByRole('region',{name:'Message thread',exact:true}); const replyInput=peerThread.getByRole('textbox',{name:'Thread reply',exact:true});
    await expect(replyInput).toBeEnabled(); await replyInput.fill(`@${member.username}`);
    await expect(peerThread.getByRole('option',{name:`Jordan Rivers @${member.username}`,exact:true})).toBeVisible(); await replyInput.press('Tab'); await replyInput.press('End'); await peer.keyboard.type(' Live focused reply'); await replyInput.press('Enter');
    let live=thread.locator('.chat-message').filter({hasText:'Live focused reply'}); await expect(live).toHaveCount(1); const liveId=(await live.getAttribute('data-thread-message-id'))!; live=thread.locator(`[data-thread-message-id="${liveId}"]`);
    const peerLive=peerThread.locator(`[data-thread-message-id="${liveId}"]`); await actions(peerLive); await peerLive.getByRole('button',{name:'Edit',exact:true}).click(); await peerLive.getByRole('textbox',{name:'Edit message',exact:true}).fill('Edited thread reply'); await peerLive.getByRole('button',{name:'Save edit',exact:true}).click(); await expect(live.getByText('Edited thread reply',{exact:true})).toBeVisible();
    await actions(live); await live.locator('summary').filter({hasText:/^Add reaction$/}).click(); await live.getByRole('button',{name:'React 👍',exact:true}).click(); await expect(peerLive.getByRole('button',{name:'👍 reaction, 1',exact:true})).toBeVisible();
    await peerLive.locator('summary').filter({hasText:/^Delete message$/}).click(); await peerLive.getByRole('button',{name:'Confirm delete',exact:true}).click(); await expect(live.getByText('Message deleted',{exact:true})).toBeVisible();
    await thread.getByRole('button',{name:'Back to channel',exact:true}).click(); await openRoot(beta); await expect(thread.locator('.thread-original')).toContainText('Thread beta original'); await expect(thread.getByRole('textbox',{name:'Thread reply',exact:true})).toHaveValue(''); await thread.getByRole('textbox',{name:'Thread reply',exact:true}).fill('Beta side conversation'); await thread.getByRole('button',{name:'Send message',exact:true}).click(); await expect(thread.locator('[data-thread-message-id]').getByText('Beta side conversation',{exact:true})).toBeVisible(); await expect(peerThread.getByText('Beta side conversation',{exact:true})).toHaveCount(0);
    await thread.getByRole('button',{name:'Back to channel',exact:true}).click(); await openRoot(alpha); await expect(thread.getByText('Historical reply 65',{exact:true})).toBeVisible(); await expect(thread.locator('[data-thread-message-id]').getByText('Beta side conversation',{exact:true})).toHaveCount(0);
    await page.goto(`/channels/${channel}?message=${oldestReplyId}`);
    await expect(thread.getByText('Historical reply 1',{exact:true})).toBeVisible();
    await expect(thread.locator(`[data-thread-message-id="${oldestReplyId}"]`)).toHaveClass(/highlighted/);
    const scan=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze(); expect(scan.violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)}))).toEqual([]); expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
    await page.screenshot({path:test.info().outputPath('thread-workspace.png')});
    await db.query('delete from public.channel_permission_overrides where channel_id=$1 and user_id=$2',[channel,peerId]);
    await expect(peer.getByRole('heading',{name:'Channel access is unavailable',exact:true})).toBeVisible(); await expect(peer.getByText('Historical reply 65',{exact:true})).toHaveCount(0);
    expect((await client.rpc('channel_thread_page',{p_channel:channel,p_parent:alpha})).error?.code).toBe('42501'); expect(errors).toEqual([]);
  } finally { await context.close(); await db.query('delete from public.communities where id=$1',[community]); await db.end(); if(peerId) await adminClient().auth.admin.deleteUser(peerId); }
});
