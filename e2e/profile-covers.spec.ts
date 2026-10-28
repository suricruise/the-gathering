import{test,expect,adminClient,userClient,signIn}from'./helpers';
import{randomUUID}from'node:crypto';
import sharp from'sharp';
test('personal cover uploads fill the card and respect profile privacy, blocks and removal',async({memberPage:page,member,browser},info)=>{
 test.setTimeout(150000);
 const admin=adminClient(),owner=userClient();expect((await owner.auth.signInWithPassword({email:member.email,password:member.password})).error).toBeNull();
 const suffix=randomUUID().slice(0,8),email=`cover-${suffix}@example.test`,password=`Gathering-${randomUUID()}`;
 const created=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{date_of_birth:'1990-01-01'}});expect(created.error).toBeNull();const peerId=created.data.user!.id;
 const peer=userClient(),context=await browser.newContext();
 try{
  expect((await peer.auth.signInWithPassword({email,password})).error).toBeNull();expect((await peer.rpc('save_lounge_profile',{p_username:`cover_${suffix}`,p_display_name:'Cover reader',p_bio:'',p_visibility:'members',p_interests:['music'],p_games:[],p_platforms:[],p_complete:true,p_share_interests:false})).data).toBe(true);
  expect((await peer.rpc('people_command',{p_operation:'privacy',p_data:{discoverable:true,allow_requests:true,dm_policy:'friends',share_presence:false}})).error).toBeNull();
  const other=await context.newPage();await signIn(other,email,password);
  await page.goto('/profile');
  const editor=page.getByRole('region',{name:'Profile cover image'}),file=editor.getByLabel('Choose profile cover');
  await expect(file).toBeEnabled();
  await file.setInputFiles({name:'unsafe.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg/>')});await expect(editor.getByRole('alert')).toContainText('JPG, PNG or WebP');await expect(editor.getByRole('button',{name:'Upload cover image'})).toBeDisabled();
  const png=await sharp({create:{width:1600,height:600,channels:3,background:'#5E518B'}}).png().toBuffer();
  await file.setInputFiles({name:'personal-cover.png',mimeType:'image/png',buffer:png});await expect(editor.getByAltText('Selected cover preview')).toBeVisible();
  await editor.getByRole('button',{name:'Upload cover image',exact:true}).click();await expect(editor.getByRole('status')).toContainText('Your profile cover has been updated.');
  const hero=page.locator('.premium-profile-cover .profile-cover-image');await expect(hero).toBeVisible();await expect.poll(()=>hero.evaluate((el:HTMLImageElement)=>el.complete&&el.naturalWidth>0)).toBe(true);
  const saved=await owner.rpc('visible_profile_cover',{p_id:member.id});expect(saved.error).toBeNull();expect(saved.data).toContain('/cover-');
  // Storage remains inaccessible even to the owner; only the authorized route can serve it.
  expect((await owner.storage.from('avatars').download(saved.data)).error).toBeTruthy();
  const target=`/api/profile-covers/${member.id}`;
  expect((await page.request.get(target)).status()).toBe(200);expect((await other.request.get(target)).status()).toBe(404);
  await page.reload();await expect(page.locator('.premium-profile-cover .profile-cover-image')).toBeVisible();await expect.poll(()=>page.locator('.premium-profile-cover .profile-cover-image').evaluate((el:HTMLImageElement)=>el.complete&&el.naturalWidth>0)).toBe(true);
  await page.screenshot({path:info.outputPath('profile-cover-editor.png'),fullPage:true});
  await page.goto('/home');
  if(info.project.name==='mobile')await page.getByRole('button',{name:'Open activity',exact:true}).click();
  const card=page.locator('.premium-mini-profile').filter({visible:true});await expect(card.locator('.profile-cover-image')).toBeVisible();await expect.poll(()=>card.locator('.profile-cover-image').evaluate((el:HTMLImageElement)=>el.complete&&el.naturalWidth>0)).toBe(true);
  const bounds=await card.boundingBox(),cover=await card.locator('.premium-mini-cover').boundingBox();expect(Math.abs(cover!.x-bounds!.x-1)).toBeLessThanOrEqual(1);expect(Math.abs(cover!.width-bounds!.width+2)).toBeLessThanOrEqual(1);
  await card.screenshot({path:info.outputPath('profile-cover-member-card.png')});
  const saveVisibility=async(visibility:string)=>{expect((await owner.rpc('save_lounge_profile',{p_username:member.username,p_display_name:'Jordan Rivers',p_bio:'Browser test profile',p_visibility:visibility,p_interests:['music'],p_games:['minecraft'],p_platforms:['pc'],p_complete:false,p_share_interests:false})).data).toBe(true);};
  await saveVisibility('members');const allowed=await other.request.get(target);expect(allowed.status()).toBe(200);expect(allowed.headers()['cache-control']).toBe('private, no-store');
  expect((await owner.rpc('people_command',{p_operation:'block',p_data:{target:peerId}})).error).toBeNull();expect((await other.request.get(target)).status()).toBe(404);expect((await page.request.get(target)).status()).toBe(200);
  expect((await owner.rpc('people_command',{p_operation:'unblock',p_data:{target:peerId}})).error).toBeNull();
  await saveVisibility('private');expect((await other.request.get(target)).status()).toBe(404);
  await page.goto('/profile');page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'Remove cover image',exact:true}).click();await expect(page.locator('.premium-profile-cover .profile-cover-image')).toHaveCount(0);expect((await page.request.get(target)).status()).toBe(404);expect((await owner.rpc('visible_profile_cover',{p_id:member.id})).data).toBeNull();expect((await admin.storage.from('avatars').download(saved.data)).error).toBeTruthy();
 }finally{await context.close();await admin.auth.admin.deleteUser(peerId);}
});
