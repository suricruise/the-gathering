import 'server-only';
import type{SupabaseClient}from'@supabase/supabase-js';
export async function readProfileCover(client:SupabaseClient,id:string){
 try{const r=await client.rpc('visible_profile_cover',{p_id:id});
 return{available:!r.error,path:!r.error&&typeof r.data==='string'?r.data:null};
 }catch{return{available:false,path:null};}
}
export function coverVersion(path:string|null){return path?.split('/').pop()??null;}
