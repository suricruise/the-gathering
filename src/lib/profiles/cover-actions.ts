'use server';
import{randomUUID}from'node:crypto';
import sharp from'sharp';
import{revalidatePath}from'next/cache';
import{requireUser}from'../auth/session';
import{allowAuthAttempt}from'../auth/rate-limit';
import{createAdminClient}from'../supabase/admin';
import type{ActionState}from'../auth/state';
import{readProfileCover}from'./covers';
const MAX=2*1024*1024;
export async function uploadProfileCover(_previous:ActionState,form:FormData):Promise<ActionState>{
 const{client,user}=await requireUser('/profile');
 const file=form.get('cover');
 if(!(file instanceof File)||!file.size||file.size>MAX||!['image/jpeg','image/png','image/webp'].includes(file.type))return{error:'Choose a JPG, PNG or WebP cover image no larger than 2 MB.'};
 const current=await readProfileCover(client,user.id);
 if(!current.available)return{error:'Profile cover services are unavailable. Apply the profile-cover setup migration and retry.'};
 if(!(await allowAuthAttempt(`profile-cover:${user.id}`)))return{error:'Please wait before uploading another cover image.'};
 let buffer:Buffer;
 try{
  const input=Buffer.from(await file.arrayBuffer());
  const meta=await sharp(input,{limitInputPixels:16_777_216,animated:false}).metadata();
  if(!['jpeg','png','webp'].includes(meta.format??'')||!meta.width||!meta.height||meta.width>8192||meta.height>8192||(meta.pages??1)>1)return{error:'Choose a still image up to 8192 pixels per side and 16 megapixels.'};
  buffer=await sharp(input,{limitInputPixels:16_777_216}).rotate().resize(1600,600,{fit:'cover',withoutEnlargement:true}).webp({quality:82}).toBuffer();
  if(buffer.length>MAX)return{error:'This image is too large after processing. Choose a smaller image.'};
 }catch{return{error:'This file could not be decoded as a safe cover image.'};}
 const admin=createAdminClient(),path=`${user.id}/cover-${randomUUID()}.webp`;
 const uploaded=await admin.storage.from('avatars').upload(path,buffer,{contentType:'image/webp',upsert:false,cacheControl:'0'});
 if(uploaded.error)return{error:'Your cover image could not be uploaded. Please retry.'};
 const saved=await admin.rpc('set_profile_cover',{p_user:user.id,p_path:path,p_expected:current.path});
 if(saved.error||!saved.data||saved.data.previous!==current.path){
  // A transport failure may occur after commit. Delete only on a confirmed
  // transaction rejection; otherwise retain the private object for safe recovery.
  if(saved.error&&['40001','42501','22023'].includes(saved.error.code))await admin.storage.from('avatars').remove([path]);
  return{error:saved.error?.code==='40001'?'Your cover changed in another tab. Refresh and retry.':'Your cover upload could not be confirmed. Refresh before trying again.'};
 }
 if(current.path&&current.path!==path)await admin.storage.from('avatars').remove([current.path]);
 revalidatePath('/','layout');
 return{notice:'Your profile cover has been updated.'};
}
export async function removeProfileCover(_previous:ActionState,_form:FormData):Promise<ActionState>{
 void _previous;void _form;
 const{client,user}=await requireUser('/profile');
 const current=await readProfileCover(client,user.id);
 if(!current.available)return{error:'Profile cover services are unavailable. Please retry.'};
 if(!(await allowAuthAttempt(`profile-cover:${user.id}`)))return{error:'Please wait before changing your cover image again.'};
 const admin=createAdminClient();
 const saved=await admin.rpc('set_profile_cover',{p_user:user.id,p_path:null,p_expected:current.path});
 if(saved.error||!saved.data||saved.data.previous!==current.path)return{error:'Your cover removal could not be confirmed. Refresh before trying again.'};
 if(current.path)await admin.storage.from('avatars').remove([current.path]);
 revalidatePath('/','layout');
 return{notice:'Your cover image was removed. The default background is restored.'};
}
