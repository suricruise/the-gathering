import {test,expect,adminClient,userClient} from './helpers';
import {randomUUID} from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
test('premium profile editing, shared-interest discovery and privacy',async({memberPage:page,member},info)=>{
 test.setTimeout(120000);
 const originalViewport=page.viewportSize()!;
 const admin=adminClient(),suffix=randomUUID().slice(0,8),email=`profile-${suffix}@example.test`,password=`Gathering-${randomUUID()}`,username=`profile_${suffix}`;
 const created=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{date_of_birth:'1990-01-01'}});expect(created.error).toBeNull();const id=created.data.user!.id;
 try{
  const peer=userClient();expect((await peer.auth.signInWithPassword({email,password})).error).toBeNull();
  expect((await peer.rpc('save_lounge_profile',{p_username:username,p_display_name:'Avery Lounge',p_bio:'Music, stories and good conversation.',p_visibility:'members',p_interests:['music','books-comics'],p_games:['minecraft'],p_platforms:['pc'],p_complete:true,p_share_interests:true})).data).toBe(true);
  expect((await peer.rpc('people_command',{p_operation:'privacy',p_data:{discoverable:true,allow_requests:true,dm_policy:'friends',share_presence:false}})).error).toBeNull();
  await page.goto('/profile');await expect(page.getByRole('heading',{name:'Your profile',exact:true})).toBeVisible();
  await page.getByRole('checkbox',{name:'Music',exact:true}).check();await page.getByRole('checkbox',{name:'Books & Comics',exact:true}).check();await page.getByLabel(/Show selected interests/).check();
  await page.getByRole('button',{name:'Save profile',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'Your profile has been saved.'})).toBeVisible();await page.reload();
  await expect(page.getByRole('checkbox',{name:'Music',exact:true})).toBeChecked();await expect(page.getByLabel(/Show selected interests/)).toBeChecked();await expect(page.getByRole('checkbox',{name:'Minecraft',exact:true})).toBeChecked();
  await page.goto('/messages?tab=discover');const recommendations=page.getByRole('region',{name:'People you may connect with'});await expect(recommendations.locator(`a[href="/members/${id}"]`)).toBeVisible();
  await recommendations.locator(`a[href="/members/${id}"]`).click();await expect(page).toHaveURL(new RegExp(`/members/${id}$`));await expect(page.getByRole('heading',{name:'Avery Lounge',exact:true})).toBeVisible();
  await expect(page.getByText('Books & Comics',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Add friend',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Message',exact:true})).toHaveCount(0);await expect(page.getByText(email,{exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'Add friend',exact:true}).click();await expect(page.getByRole('button',{name:'Cancel request',exact:true})).toBeVisible();
  expect((await peer.rpc('people_command',{p_operation:'accept',p_data:{target:member.id}})).error).toBeNull();
  for(const width of [320,760,1440]){await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
  await page.setViewportSize(originalViewport);
  expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations).toEqual([]);
  await page.screenshot({path:info.outputPath('premium-profile.png'),fullPage:true});
  expect((await peer.rpc('save_lounge_profile',{p_username:username,p_display_name:'Avery Lounge',p_bio:'Private bio must be hidden',p_visibility:'private',p_interests:['music'],p_games:['minecraft'],p_platforms:['pc'],p_complete:false,p_share_interests:true})).data).toBe(true);
  await page.reload();await expect(page.getByText('Profile details are private.',{exact:false})).toBeVisible();await expect(page.getByText('Private bio must be hidden',{exact:true})).toHaveCount(0);
  await page.goto('/messages?tab=discover');await expect(page.getByRole('region',{name:'People you may connect with'}).locator(`a[href="/members/${id}"]`)).toHaveCount(0);
  // Verified owner retains their own selected interests even with a private profile.
  const own=userClient();await own.auth.signInWithPassword({email:member.email,password:member.password});expect((await own.rpc('lounge_profile',{p_username:member.username})).data.interests).toContain('music');
 }finally{await admin.auth.admin.deleteUser(id);}
});
