"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Users, RefreshCw, Search } from "lucide-react";
import { communityMembers, communityMemberAction, type MemberDirectoryData, type DirectoryMember } from "../../lib/communities/members";
import { peopleCommand } from "../../lib/people/actions";
import { usePeople } from "./PeopleProvider";
export function MemberDirectory({ community, channel, compact=false }: { community?:string; channel?:string; compact?:boolean }) {
 const ctx=usePeople(),router=useRouter(),generation=useRef(0),size=compact?12:30;
 const [data,setData]=useState<MemberDirectoryData|null>(null),[next,setNext]=useState<string|null>(null),[query,setQuery]=useState(""),[filter,setFilter]=useState({query:"",role:"all",online:false}),[busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const load=useCallback(async(after?:string,quiet=false)=>{
  const token=++generation.current;if(!quiet)setBusy(true);if(!after&&!quiet)setData(null);setError("");
  try {
    const r=await communityMembers({community:community||null,channel:channel||null,query:filter.query,role:filter.role,online:filter.online,after:after||null,size});
    if(token!==generation.current)return;
    if(r.data){const rows=r.data.items.slice(0,size);setData(old=>({...r.data!,items:after&&old?[...new Map([...old.items,...rows].map(p=>[p.id,p])).values()]:rows}));setNext(r.data.items.length>size?rows.at(-1)?.id||null:null);}else{setError(r.error||"Members unavailable.");setData(null);setNext(null);}
  } catch {
    if(token===generation.current){setError("Could not load members. Check your connection and retry.");setData(null);setNext(null);}
  } finally { if(token===generation.current)setBusy(false); }

 },[community,channel,filter,size]);
 useEffect(()=>{
  void load();
  return()=>{
   // Monotonic request counter; this ref never points at a DOM node.
   // eslint-disable-next-line react-hooks/exhaustive-deps
   generation.current++;
  };
 },[load]);
 const connections = (ctx?.home?.friends.map(p=>`${p.id}:${p.relationship}:${p.online}`).join("|")||"") + (ctx?.home?.blocks.map(p=>p.id).join("|")||"");
 const previousConnections = useRef(connections);
 useEffect(()=>{if(previousConnections.current!==connections){previousConnections.current=connections;void load(undefined,true);}},[connections,load]);
 useEffect(()=>{
  if(!compact)return;
  const refresh=()=>{if(document.visibilityState==="visible"&&navigator.onLine)void load(undefined,true);};
  const timer=setInterval(refresh,30000);window.addEventListener("online",refresh);document.addEventListener("visibilitychange",refresh);
  return()=>{clearInterval(timer);window.removeEventListener("online",refresh);document.removeEventListener("visibilitychange",refresh);};
 },[compact,load]);
 async function run(person:DirectoryMember,operation:string){
  if(!data||busy)return;
  if(operation==="block"&&!window.confirm(`Block ${person.name}? This removes your friendship and prevents contact.`))return;
  setBusy(true);setNotice("");setError("");
  try{
   const r=["request","open","block"].includes(operation)?await communityMemberAction({community:data.community.id,target:person.id,operation}):await peopleCommand({operation,target:person.id});
   if(r.error){await load();setError(r.error);return;}
   await ctx?.refresh();
   if(r.data?.id){router.push(`/messages/${r.data.id}`);return;}
   await load();setNotice(operation==="block"?"Member blocked.":"Friend request status updated.");
  }catch{setError("The request failed. Check your connection and retry.");}finally{setBusy(false);}
 }
 const roleNames:Record<string,string>={owner:"Owner",administrator:"Administrator",moderator:"Moderator",member:"Member"};
 return <section className={`member-directory ${compact?"member-directory-compact":""}`} aria-label="Community member directory">
  <div className="section-heading"><h2><Users size={18}/>{data?`Members in ${data.community.name}`:"Community members"}</h2><button className="icon-button" aria-label="Refresh member list" disabled={busy} onClick={()=>void load()}><RefreshCw size={16}/></button></div>
  <p className="muted">{data?`${data.total} visible member${data.total===1?"":"s"}`:"Members are shown only to their community."}</p>
  <form className="member-filters" onSubmit={e=>{e.preventDefault();setData(null);setNext(null);setFilter(f=>({...f,query}));}}>
   <label className="field">Search community members<input value={query} onChange={e=>setQuery(e.target.value)} maxLength={48} placeholder="Name or @username" /></label>
   {!compact&&<><label className="field">Community role<select value={filter.role} onChange={e=>{setData(null);setFilter(f=>({...f,role:e.target.value}));}}>{["all","owner","administrator","moderator","member"].map(role=><option key={role} value={role}>{role==="all"?"All roles":roleNames[role]}</option>)}</select></label><label className="member-check"><input type="checkbox" checked={filter.online} onChange={e=>{setData(null);setFilter(f=>({...f,online:e.target.checked}));}}/>Online friends only</label></>}
   <button className="button secondary" disabled={busy}><Search size={16}/> Search members</button>
  </form>
  {busy&&<p role="status">Loading members…</p>}
  {error&&<p className="form-error" role="alert">{error} <button className="button secondary" onClick={()=>void load()}>Retry</button></p>}
  {notice&&<p className="form-notice" role="status">{notice}</p>}
  {data&&data.items.length===0&&<p>No members match these filters.</p>}
  <div className="member-grid">{data&&[...data.items].sort((a,b)=>Number(b.online===true)-Number(a.online===true)).map(p=><article className="member-card" key={p.id}>
   <div className="member-identity">{p.avatar?<img src={`/api/avatars/${p.id}`} alt="" width={40} height={40} className="people-avatar"/>:<span className="people-avatar" aria-hidden="true">{(p.name||p.username).slice(0,1).toUpperCase()}</span>}<div><h3>{p.name||p.username}{p.self&&<small> · You</small>}</h3><p>@{p.username}</p><span className="member-role">{roleNames[p.role]||"Member"}</span></div></div>
   <p className="member-presence"><span className={`status-dot ${p.online===true?"online":p.online===false?"offline":"private"}`} aria-hidden="true"/>{p.online===null?"Status private":p.online?"Online":"Offline"}</p>
   <div className="member-actions">
    {p.profile_visible?<Link href={p.self?"/profile":`/members/${p.id}`}>View profile</Link>:<span className="muted">Profile private</span>}
    {!p.self&&<>
     {p.relationship==="none"&&(p.can_request?<button className="button secondary" disabled={busy} onClick={()=>void run(p,"request")}>Add friend</button>:<span className="muted">Requests off</span>)}
     {p.relationship==="outgoing"&&<><span className="member-request">Request sent</span><button className="button secondary" disabled={busy} onClick={()=>void run(p,"cancel")}>Cancel request</button></>}
     {p.relationship==="incoming"&&<><button className="button primary" disabled={busy} onClick={()=>void run(p,"accept")}>Accept request</button><button className="button secondary" disabled={busy} onClick={()=>void run(p,"decline")}>Decline</button></>}
     {p.relationship==="friends"&&<span className="member-request">Friends</span>}
     {p.can_message&&<button className="button secondary" disabled={busy} onClick={()=>void run(p,"open")}>Message</button>}
     <details><summary>More actions</summary><div className="member-more-actions">{p.relationship==="friends"&&<button className="button secondary" disabled={busy} onClick={()=>void run(p,"remove")}>Remove friend</button>}<button className="button secondary" disabled={busy} onClick={()=>void run(p,"block")}>Block member</button><Link href={`/reports?type=user&target=${p.id}`}>Report member</Link></div></details>
    </>}
   </div>
  </article>)}</div>
  {next&&<button className="button secondary" disabled={busy} onClick={()=>void load(next)}>Load more members</button>}
  <p className="muted member-privacy-note">Community names and handles are shared with fellow members. Profiles stay private when selected; online status is shown only for friends who share it.</p>
  {compact&&data&&<Link className="button secondary" href={`/members?community=${data.community.id}`}>Open full member list</Link>}
 </section>;
}
