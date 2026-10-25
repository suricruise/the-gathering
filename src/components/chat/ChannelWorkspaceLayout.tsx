"use client";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { Hash, Volume2, Menu, Users, X, PanelRightClose } from "lucide-react";
import type { Community } from "../../lib/communities/data";
import { workspaceNavigation, type WorkspaceChannel, type WorkspaceNavigation } from "../../lib/chat/workspace";
import { CommunityBanner } from "../communities/CommunityBanner";
import { CommunityChannelSidebar } from "./CommunityChannelSidebar";
import { usePeople } from "../people/PeopleProvider";
import { getCommunityChatState } from "../../lib/chat/reliability";
import { saveNavigation } from "../../lib/chat/navigation";
import { ChatIdentity } from "./ChatIdentity";
import { ChatSearch } from "./ChatSearch";
import { ChatNotificationSettings } from "./ChatNotificationSettings";
import { WorkspaceMembers } from "./WorkspaceMembers";
export function ChannelWorkspaceLayout({community,channel,initial,children}:{community:Community;channel:WorkspaceChannel;initial:WorkspaceNavigation;children:ReactNode}){
 const [navigation,setNavigation]=useState(initial),[error,setError]=useState(""),[showMembers,setShowMembers]=useState(true),[narrow,setNarrow]=useState(false),[membersOpen,setMembersOpen]=useState(false);
 const people=usePeople();
 const [chatState,setChatState]=useState(initial.chat),[searchOpen,setSearchOpen]=useState(false),[navError,setNavError]=useState("");
 const searchDialog=useRef<HTMLDialogElement>(null),navigationRequest=useRef(0);
 const saveQueue=useRef(Promise.resolve());
 useEffect(()=>{setChatState(initial.chat);},[initial.chat,channel.id]);
 useEffect(()=>{setSearchOpen(false);searchDialog.current?.close();setNavError("");},[channel.id]);
 useEffect(()=>{const token=++navigationRequest.current;void saveNavigation({channel:channel.id}).then(r=>{if(token!==navigationRequest.current)return;if(r.data)setChatState(r.data);else setNavError(r.error??"Navigation preferences unavailable.");}).catch(()=>{if(token===navigationRequest.current)setNavError("Navigation preferences unavailable.");});return()=>{
 // Monotonic request generation, not a DOM ref.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 navigationRequest.current++;};},[channel.id]);
 const collapse=(collapsed:string[])=>{setChatState(old=>old?{...old,collapsed}:old);const token=++navigationRequest.current;saveQueue.current=saveQueue.current.then(async()=>{const r=await saveNavigation({channel:channel.id,collapsed});if(token!==navigationRequest.current)return;if(r.data)setChatState(r.data);setNavError(r.error??"");}).catch(()=>{if(token===navigationRequest.current)setNavError("Category preference could not be saved. Retry the toggle.");});};


 const countsRequest=useRef(0),countsTimer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined),countsBusy=useRef(false),countsAgain=useRef(false);
 const channelsDialog=useRef<HTMLDialogElement>(null),membersDialog=useRef<HTMLDialogElement>(null),request=useRef(0);
 const refresh=useCallback(async()=>{const token=++request.current;try{const r=await workspaceNavigation(channel.id);if(token!==request.current)return;if(r.data){setNavigation(r.data);if(r.data.chat)setChatState(r.data.chat);setError("");}else{setError(r.error||"Navigation unavailable.");if(r.denied)setNavigation(old=>({...old,channels:[],categories:[],unread:[],mentions:[]}));}}catch{if(token===request.current)setError("Navigation unavailable. Please retry.");}},[channel.id]);
 useEffect(()=>{const close=()=>{setSearchOpen(false);searchDialog.current?.close();void refresh();};window.addEventListener('gathering:chat-access-changed',close);return()=>window.removeEventListener('gathering:chat-access-changed',close);},[refresh]);
 useEffect(()=>{setNavigation(initial);setError("");},[initial]);
 useEffect(()=>{const update=()=>setNarrow(matchMedia("(max-width: 1050px)").matches);update();window.addEventListener("resize",update);return()=>window.removeEventListener("resize",update);},[]);
 useEffect(()=>{const update=()=>{if(document.visibilityState==="visible"&&navigator.onLine)void refresh();};const timer=setInterval(update,30000);window.addEventListener("online",update);document.addEventListener("visibilitychange",update);return()=>{clearInterval(timer);window.removeEventListener("online",update);document.removeEventListener("visibilitychange",update);
 // Monotonic request counter; never a DOM node.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 request.current++;
 };},[refresh]);
 useEffect(()=>()=>{countsRequest.current++;clearTimeout(countsTimer.current);countsTimer.current=undefined;countsAgain.current=false;
 },[community.id]);
 const refreshCounts=useCallback(()=>{
  if(countsTimer.current)return;
  if(countsBusy.current){countsAgain.current=true;return;}
  countsTimer.current=setTimeout(()=>{countsTimer.current=undefined;countsBusy.current=true;const token=countsRequest.current;
   void getCommunityChatState(community.id).then(result=>{if(token!==countsRequest.current)return;if(result.data)setNavigation(old=>({...old,unread:result.data!.unread,mentions:result.data!.mentions}));else if(result.denied)void refresh();}).catch(()=>{}).finally(()=>{countsBusy.current=false;if(countsAgain.current&&token===countsRequest.current){countsAgain.current=false;refreshCounts();}});
  },120);
 },[community.id,refresh]);
 useEffect(()=>{if(people?.chatRevision)refreshCounts();},[people?.chatRevision,refreshCounts]);
 const identityReady=!!chatState,identityUsername=chatState?.username??"",identityCanMass=chatState?.can_mass_mention===true;
 const identity=useMemo(()=>identityReady?{username:identityUsername,canMassMention:identityCanMass,role:navigation.role}:null,[identityReady,identityUsername,identityCanMass,navigation.role]);
 const sidebar=(close?:()=>void)=><CommunityChannelSidebar data={navigation} name={community.name} slug={community.slug} active={channel.id} onNavigate={close} collapsed={chatState?.collapsed} onCollapse={collapse}/>;
 return <ChatIdentity.Provider value={identity}><div className={`community-chat-workspace ${showMembers?"with-members":""}`}>
 <div className="workspace-community-banner"><CommunityBanner community={community}/></div>
 <div className="community-chat-workspace-panes"><aside className="workspace-channels-desktop" aria-label="Channel directory">{sidebar()}</aside>
 <section className="workspace-conversation" aria-label={`${channel.name} channel`}><header className="workspace-channel-header">
 <button className="icon-button workspace-channels-toggle" aria-label="Open channels" onClick={()=>channelsDialog.current?.showModal()}><Menu size={20}/></button>
 <div className="workspace-channel-title"><h1 aria-label={`${channel.kind === "text" ? "#" : "◉"} ${channel.name}`}>{channel.kind==="voice"?<Volume2 size={21}/>:<Hash size={21}/>}<span>{channel.name}</span>{channel.is_private&&<small>Private</small>}</h1>{channel.description&&<p title={channel.description}><span className="sr-only">Channel topic: </span>{channel.description}</p>}</div>
 <button type="button" className="chat-text-button" onClick={()=>{setSearchOpen(true);searchDialog.current?.showModal();}}>Search messages</button>
 <Link className="workspace-community-back" href={`/communities/${community.slug}`}>← {community.name}</Link>
 <button className="icon-button workspace-members-toggle" aria-label={narrow?"Open community members":showMembers?"Hide community members":"Show community members"} aria-expanded={narrow?membersOpen:showMembers} onClick={()=>{if(narrow){setMembersOpen(true);membersDialog.current?.showModal();}else setShowMembers(!showMembers);}}>{showMembers&&!narrow?<PanelRightClose size={20}/>:<Users size={20}/>}</button>
 </header>{error&&<p className="workspace-navigation-error" role="alert">{error} <button className="chat-text-button" onClick={()=>void refresh()}>Retry navigation</button></p>}
 {navError&&<p className="workspace-navigation-error" role="status">{navError}</p>}{chatState&&<ChatNotificationSettings channel={channel.id} value={chatState} onSave={setChatState}/>}
 <div className="workspace-conversation-body">{children}</div>
 </section>
 {showMembers&&!narrow&&<aside className="workspace-members-desktop" aria-label="Community members"><WorkspaceMembers key={channel.id} channel={channel.id}/><Link className="workspace-member-directory" href={`/members?community=${community.id}`}>Browse community members · Add friends</Link></aside>}
 </div>
 <dialog ref={channelsDialog} className="workspace-drawer workspace-channel-drawer" aria-label="Channels"><header><h2>Channels</h2><button className="icon-button" aria-label="Close channels" onClick={()=>channelsDialog.current?.close()}><X size={20}/></button></header>{sidebar(()=>channelsDialog.current?.close())}</dialog>
 <dialog ref={membersDialog} className="workspace-drawer workspace-members-drawer" aria-label="Members" onClose={()=>setMembersOpen(false)}><header><h2>Members</h2><button className="icon-button" aria-label="Close members" onClick={()=>membersDialog.current?.close()}><X size={20}/></button></header>{membersOpen&&<WorkspaceMembers key={channel.id} channel={channel.id}/>}<Link className="button secondary" href={`/members?community=${community.id}`} onClick={()=>membersDialog.current?.close()}>Browse community members · Add friends</Link></dialog>
 <dialog ref={searchDialog} className="chat-search-dialog" aria-label="Advanced message search" onClose={()=>setSearchOpen(false)}>{searchOpen&&<ChatSearch community={community.id} channel={channel.id} channels={navigation.channels} onClose={()=>{setSearchOpen(false);searchDialog.current?.close();}}/>}</dialog>
 </div></ChatIdentity.Provider>;
}
