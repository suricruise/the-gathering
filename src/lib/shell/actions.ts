'use server';
import {createClient} from '../supabase/server';
import {workspaceNavigation} from '../chat/workspace';
import type {ShellData,RailCommunity} from './types';
import type {Person,Result} from '../people/types';
export async function shellNavigation(path:string,limit=30):Promise<Result<ShellData>>{
 if(!Number.isInteger(limit)||limit<1||limit>200)return{error:'Invalid community page.'};
 if(typeof path!=='string'||path.length>250||!path.startsWith('/'))return{error:'Navigation unavailable.'};
 try{
  const client=await createClient();const {data:{user},error}=await client.auth.getUser();if(error||!user?.email_confirmed_at)return{error:'Sign in to load communities.',denied:true};
  const joined=await client.rpc('member_communities');if(joined.error||!Array.isArray(joined.data))return{error:'Communities unavailable. Please retry.',denied:joined.error?.code==='42501'};
  const all=joined.data as {id:string;name:string;slug:string}[];
  const channel=/^\/channels\/([0-9a-f-]{36})$/i.exec(path)?.[1];
  const selectedChannel=channel?await client.from('channels').select('community_id').eq('id',channel).maybeSingle():null;
  const slug=/^\/communities\/([^/]+)/.exec(path)?.[1];
  const active=all.find(c=>channel?c.id===selectedChannel?.data?.community_id:c.slug===slug||c.id===slug);
  const items=all.slice(0,limit);if(active&&!items.some(c=>c.id===active.id))items.push(active);
  const covers=items.length?await client.from('communities').select('id,cover,community_headers(version)').in('id',items.map(c=>c.id)):null;
  if(covers?.error)return{error:'Community images are unavailable. Please retry.'};
  const communities:RailCommunity[]=items.map(c=>{const cover=covers?.data?.find(v=>v.id===c.id);const header=cover?.community_headers as unknown as {version:string}|null;return{...c,image:header?`/api/communities/${c.id}/header?v=${encodeURIComponent(header.version)}`:cover?.cover?`/covers/${cover.cover}.svg`:null,unread:null};});
  // Bound in-flight reads while reusing the existing authoritative unread projection.
  for(let offset=0;offset<communities.length;offset+=6){await Promise.all(communities.slice(offset,offset+6).map(async c=>{const r=await client.rpc('channel_unread_counts',{p_community:c.id});if(!r.error)c.unread=(r.data??[]).some((v:{unread_count:string|number})=>BigInt(v.unread_count)>0n);}));}
  const selected=communities.find(c=>c.id===active?.id);
  let navigation=null;
  if(selected&&!channel){const first=await client.from('channels').select('id').eq('community_id',selected.id).order('position').order('name').limit(1);if(first.data?.[0]){const r=await workspaceNavigation(first.data[0].id);navigation=r.data??null;}else{const role=await client.rpc('community_my_role',{p_community:selected.id});navigation={communityId:selected.id,channels:[],categories:[],communities:all,role:role.data??'',unread:[],mentions:[],warning:'No accessible channels yet. Open community overview for membership and settings.'};}}
  return{data:{communities,hasMore:joined.data.length>limit,selected:selected?.id??null,context:selected?{community:selected,navigation}:null}};
 }catch{return{error:'Navigation services unavailable. Please retry.'};}
}
export async function suggestedMembers():Promise<Result<{items:Person[];newMembers:Person[]|null}>>{
 try{const client=await createClient();const r=await client.auth.getUser();if(r.error||!r.data.user?.email_confirmed_at)return{error:'Sign in to discover members.',denied:true};const [result,recent]=await Promise.all([client.rpc('people_search',{p_query:''}),client.rpc('lounge_new_members')]);return result.error||result.data?.limited?{error:'Suggestions unavailable. Browse members or retry later.'}:{data:{items:(result.data?.items??[]).filter((p:Person)=>p.relationship==='none').slice(0,5),newMembers:recent.error||recent.data?.limited?null:recent.data?.items??[]}};}catch{return{error:'Suggestions unavailable. Please retry.'};}
}
export async function communityActivity(community:string):Promise<Result<{items:{id:string;body:string}[]}>>{
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(community))return{error:'Activity unavailable.'};
 try{const client=await createClient();const r=await client.auth.getUser();if(r.error||!r.data.user?.email_confirmed_at)return{error:'Sign in to view activity.',denied:true};const posts=await client.from('posts').select('id,body').eq('community_id',community).order('seq',{ascending:false}).limit(3);return posts.error?{error:'Community activity unavailable.'}:{data:{items:(posts.data??[]).map(p=>({id:p.id,body:p.body.slice(0,140)}))}};}catch{return{error:'Community activity unavailable.'};}
}
