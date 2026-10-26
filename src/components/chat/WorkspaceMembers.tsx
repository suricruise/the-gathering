"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { workspaceMembers, type WorkspaceMember } from "../../lib/chat/workspace";
import { usePresenceFreshness, presenceLabel } from "../../lib/people/presence";
import { usePeople } from "../people/PeopleProvider";
export function WorkspaceMembers({channel}:{channel:string}) {
 const [members,setMembers]=useState<WorkspaceMember[]>([]),[next,setNext]=useState<string|null>(null),[error,setError]=useState(""),[busy,setBusy]=useState(false);
 const generation=useRef(0),people=usePeople();
 const blocks=people?.home?.blocks.map(p=>p.id).join("|")||"";
 const load=useCallback(async(after:string|null=null,quiet=false)=>{const token=++generation.current;if(!quiet)setBusy(true);try{const r=await workspaceMembers({channel,after});if(token!==generation.current)return;if(r.data){const rows=r.data.items.slice(0,30);setMembers(old=>after?[...new Map([...old,...rows].map(p=>[p.id,p])).values()]:rows);setNext(r.data.items.length>30?rows.at(-1)!.id:null);setError("");}else{setMembers([]);setNext(null);setError(r.error||"Members unavailable.");}}catch{if(token===generation.current){setMembers([]);setNext(null);setError("Members unavailable. Please retry.");}}finally{if(token===generation.current)setBusy(false);}},[channel]);
 useEffect(()=>{void load();const refresh=()=>{if(document.visibilityState==="visible"&&navigator.onLine)void load(null,true);};const timer=setInterval(refresh,15000);window.addEventListener("online",refresh);document.addEventListener("visibilitychange",refresh);return()=>{clearInterval(timer);window.removeEventListener("online",refresh);document.removeEventListener("visibilitychange",refresh);
 // Monotonic request counter; never a DOM node.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 generation.current++;
 };},[load,blocks]);
 const fresh=usePresenceFreshness(members);
 const groups=[{name:"Moderators",rows:members.filter(p=>["owner","administrator","moderator"].includes(p.role))},{name:"Online",rows:members.filter(p=>p.role==="member"&&p.online===true&&fresh)},{name:"Offline",rows:members.filter(p=>p.role==="member"&&p.online===false&&fresh)},{name:"Status unavailable",rows:members.filter(p=>p.role==="member"&&p.online!==null&&!fresh)},{name:"Status hidden",rows:members.filter(p=>p.role==="member"&&p.online===null)}];
 return <div className="workspace-member-list"><div className="workspace-member-title"><h2>Community members</h2><button className="icon-button" aria-label="Refresh community members" disabled={busy} onClick={()=>void load()}>↻</button></div>
 {busy&&!members.length&&<p role="status">Loading members…</p>}
 {error&&<p role="alert">{error} <button className="chat-text-button" onClick={()=>void load()}>Retry members</button></p>}
 {!busy&&!error&&!members.length&&<p>No visible members.</p>}
 {groups.filter(group=>group.rows.length).map(group=><section className="workspace-member-group" key={group.name} aria-label={group.name}><h3>{group.name} <span>{group.rows.length}</span></h3><ul>{group.rows.sort((a,b)=>a.name.localeCompare(b.name)).map(person=>{const status=presenceLabel(person.online,fresh);return <li key={person.id}><Link className="rail-person" href={`/members/${person.id}`} aria-label={person.name} title={`${person.role} · ${status}`}><span className="rail-person-picture">{person.avatar?<img src={`/api/avatars/${person.id}`} alt="" width={32} height={32}/>:<span className="rail-person-avatar" aria-hidden="true">{person.name.slice(0,1).toUpperCase()}</span>}<span className={`rail-presence ${person.online===null||!fresh?"hidden":person.online?"online":"offline"}`} aria-hidden="true"/></span><span className="workspace-member-identity"><span>{person.name}</span>{person.role!=="member"&&<small className="workspace-member-role">{person.role}</small>}</span></Link></li>;})}</ul></section>)}
 {next&&<button className="button secondary" disabled={busy} onClick={()=>void load(next)}>Load more community members</button>}
 <p className="workspace-member-note">Presence respects each member’s sharing settings. Counts show loaded members.</p>
 </div>;
}
