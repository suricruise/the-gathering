"use client";
import{useEffect,useRef,useState}from'react';
import type{ChatWorkspaceState,NotificationMode}from'../../lib/chat/navigation-types';
import{saveNotifications}from'../../lib/chat/navigation';
export function ChatNotificationSettings({channel,value,onSave}:{channel:string;value:ChatWorkspaceState;onSave:(value:ChatWorkspaceState)=>void}){
 const generation=useRef(0);
 const[community,setCommunity]=useState(value.community_mode),[selected,setSelected]=useState(value.channel_mode),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 useEffect(()=>{setCommunity(value.community_mode);setSelected(value.channel_mode);},[channel,value.community_mode,value.channel_mode]);
 useEffect(()=>{generation.current++;setNotice('');setError('');setBusy(false);return()=>{
 // Monotonic request generation, not a DOM ref.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 generation.current++;};},[channel]);
 const options=<><option value="inherit">Default / inherit</option><option value="all">All conversation activity</option><option value="mentions">Mentions only</option><option value="muted">Muted</option></>;
 return <details className="chat-notification-settings"><summary>Chat notifications</summary><form onSubmit={async e=>{e.preventDefault();const token=generation.current;setBusy(true);setError('');setNotice('');try{const r=await saveNotifications({channel,communityMode:community,channelMode:selected});if(token!==generation.current)return;if(r.data){onSave(r.data);setNotice('Notification preferences saved.');}else setError(r.error??'Preferences unavailable.');}catch{if(token===generation.current)setError('Preferences unavailable. Please retry.');}finally{if(token===generation.current)setBusy(false);}}}><label>Community notifications<select aria-label="Community notifications" value={community} disabled={busy} onChange={e=>setCommunity(e.target.value as NotificationMode)}>{options}</select></label><label>This channel notifications<select aria-label="This channel notifications" value={selected} disabled={busy} onChange={e=>setSelected(e.target.value as NotificationMode)}>{options}</select></label><p>Community mute overrides channels. Global notification opt-outs still apply. Muting does not mark messages read. All activity uses your conversation/reply notification setting.</p><button className="button secondary" disabled={busy}>Save chat notifications</button>{error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}</form></details>;
}
