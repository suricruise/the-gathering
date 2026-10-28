import{z}from'zod';
import{createClient}from'@/src/lib/supabase/server';
import{createAdminClient}from'@/src/lib/supabase/admin';
export const dynamic='force-dynamic';
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){
 const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'",'Content-Type':'image/webp'};
 const{id}=await params;
 if(!z.uuid().safeParse(id).success)return new Response(null,{status:404,headers});
 try{
  const client=await createClient(),identity=await client.auth.getUser();
  if(identity.error||!identity.data.user?.email_confirmed_at)return new Response(null,{status:404,headers});
  const r=await client.rpc('visible_profile_cover',{p_id:id});
  const path=r.data;
  if(r.error||typeof path!=='string'||!new RegExp(`^${id}/cover-[a-f0-9-]{36}\\.webp$`).test(path))return new Response(null,{status:404,headers});
  const file=await createAdminClient().storage.from('avatars').download(path);
  if(file.error||!file.data)return new Response(null,{status:404,headers});
  return new Response(file.data,{headers});
 }catch{return new Response(null,{status:404,headers});}
}
