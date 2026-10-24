"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Hash, Volume2, LockKeyhole, Settings } from "lucide-react";
import { switchWorkspaceCommunity, type WorkspaceNavigation } from "../../lib/chat/workspace";
export function CommunityChannelSidebar({data,name,slug,active,onNavigate}:{data:WorkspaceNavigation;name:string;slug:string;active:string;onNavigate?:()=>void}){
 const router=useRouter(),[busy,setBusy]=useState(false),[error,setError]=useState("");
 async function choose(id:string){if(id===data.communityId)return;setBusy(true);setError("");try{const r=await switchWorkspaceCommunity(id);if(r.data){onNavigate?.();router.push(r.data.href);}else setError(r.error||"Community unavailable.");}catch{setError("Could not switch communities. Please retry.");}finally{setBusy(false);}}
 const groups=[...data.categories.map(c=>({...c,rows:data.channels.filter(ch=>ch.category_id===c.id)})),{id:"uncategorized",name:"Channels",rows:data.channels.filter(c=>!c.category_id||!data.categories.some(cat=>cat.id===c.category_id))}].filter(g=>g.rows.length);
 return <div className="workspace-channel-sidebar"><header className="workspace-community-heading"><Link href={`/communities/${slug}`}>{name}</Link><Link className="icon-button" href={`/communities/${slug}`} aria-label={["owner","administrator","moderator"].includes(data.role)?"Community settings":"Community information"}><Settings size={17}/></Link></header>
 <label className="workspace-community-picker">Community<select aria-label="Switch community" value={data.communityId} disabled={busy} onChange={e=>void choose(e.target.value)}>{!data.communities.some(c=>c.id===data.communityId)&&<option value={data.communityId}>{name}</option>}{data.communities.map(c=><option value={c.id} key={c.id}>{c.name}</option>)}</select></label>
 <Link href="/communities" className="workspace-discover-link">Discover communities</Link>
 {busy&&<p role="status">Switching community…</p>}{error&&<p role="alert">{error}</p>}
 <nav aria-label="Community channels" className="workspace-channel-scroll">{groups.map(group=><details key={group.id} open className="workspace-channel-category"><summary><ChevronDown size={13}/><span>{group.name}</span></summary><div>{group.rows.map(channel=>{const unread=Number(data.unread.find(c=>c.channel_id===channel.id)?.unread_count||0),mentions=Number(data.mentions.find(c=>c.channel_id===channel.id)?.mention_count||0);return <Link key={channel.id} className={`workspace-channel-row ${unread?"has-unread":""}`} href={`/channels/${channel.id}`} aria-current={channel.id===active?"page":undefined} onClick={onNavigate} title={channel.description||channel.name}>
 {channel.kind==="voice"?<Volume2 size={17} aria-hidden="true"/>:<Hash size={17} aria-hidden="true"/>}<span className="workspace-channel-name">{channel.name}</span>{channel.is_private&&<LockKeyhole size={12} aria-label="Private channel"/>}
 {unread>0&&<span className="workspace-unread" aria-label={`${unread} unread messages`}>{unread>99?"99+":unread}</span>}{mentions>0&&<span className="workspace-mentions" aria-label={`${mentions} unread mentions`}>@{mentions>99?"99+":mentions}</span>}
 </Link>;})}</div></details>)}</nav>
 {data.warning&&<p className="workspace-count-warning" role="status">{data.warning}</p>}
 </div>;
}
