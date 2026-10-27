import{createClient}from'@supabase/supabase-js';
if(!process.env.NEXT_PUBLIC_SUPABASE_URL||!process.env.SUPABASE_SECRET_KEY)throw Error('Supabase server configuration required');
const c=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SECRET_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const r=await c.rpc('faith_cover_cleanup');if(r.error||!Array.isArray(r.data))throw Error('Cover cleanup unavailable');
if(r.data.length){const remove=await c.storage.from('faith-study-covers').remove(r.data);if(remove.error)throw Error('Cover deletion unavailable');const mark=await c.rpc('faith_cover_cleanup',{p_removed:r.data});if(mark.error)throw Error('Cover cleanup receipt unavailable');}
console.log('Expired unreferenced study covers processed. No file paths logged.');
