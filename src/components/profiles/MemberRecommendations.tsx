"use client";
import { useEffect,useState } from "react";
import Link from "next/link";
import { discoverMembers } from "../../lib/profiles/lounge";
import type {Person} from "../../lib/people/types";
import {interestLabels} from "../../lib/profiles/interests";
export function MemberRecommendations(){
 const [items,setItems]=useState<Person[]|null>(null),[error,setError]=useState(""),[attempt,setAttempt]=useState(0);
 useEffect(()=>{let active=true;void discoverMembers().then(r=>{if(active){setItems(r.data?.items??null);setError(r.error??"");}}).catch(()=>{if(active)setError("Recommendations unavailable.");});return()=>{active=false;};},[attempt]);
 return <section className="premium-member-recommendations" aria-label="People you may connect with"><h2>People you may connect with</h2><p className="muted">Discoverable members ranked by shared interests, mutual communities and existing connections.</p>{error?<p role="status">{error} <button onClick={()=>setAttempt(n=>n+1)}>Retry recommendations</button></p>:items===null?<p role="status">Finding shared connections…</p>:items.length?<div className="premium-person-grid">{items.map(p=><Link className="premium-person-card" href={`/members/${p.id}`} key={p.id}>{p.avatar?<img className="people-avatar" src={`/api/avatars/${p.id}`} alt="" width={48} height={48}/>:<span className="people-avatar" aria-hidden="true">{p.name.slice(0,1)}</span>}<strong>{p.name}</strong><span>@{p.username}</span>{p.shared.length>0&&<small>Shared: {p.shared.map(i=>interestLabels[i]||i).join(", ")}</small>}<small>{p.relationship==="friends"?"Already connected":"View profile & connect"}</small></Link>)}</div>:<p>No suggestions yet. Add interests to your profile or search by username below.</p>}</section>;
}
