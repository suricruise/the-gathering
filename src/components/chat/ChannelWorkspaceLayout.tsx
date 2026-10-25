"use client";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { Hash, Volume2, Menu, Users, X, PanelRightClose } from "lucide-react";
import type { Community } from "../../lib/communities/data";
import { workspaceNavigation, type WorkspaceChannel, type WorkspaceNavigation } from "../../lib/chat/workspace";
import { CommunityBanner } from "../communities/CommunityBanner";
import { CommunityChannelSidebar } from "./CommunityChannelSidebar";
import { usePeople } from "../people/PeopleProvider";
import { getCommunityChatState } from "../../lib/chat/reliability";
import { WorkspaceMembers } from "./WorkspaceMembers";
export function ChannelWorkspaceLayout({community,channel,initial,children}:{community:Community;channel:WorkspaceChannel;initial:WorkspaceNavigation;children:ReactNode}){
 const [navigation,setNavigation]=useState(initial),[error,setError]=useState(""),[showMembers,setShowMembers]=useState(true),[narrow,setNarrow]=useState(false),[membersOpen,setMembersOpen]=useState(false);
 const people=usePeople();
 const countsRequest=useRef(0),countsTimer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined),countsBusy=useRef(false),countsAgain=useRef(false);
 const channelsDialog=useRef<HTMLDialogElement>(null),membersDialog=useRef<HTMLDialogElement>(null),request=useRef(0);
 const refresh=useCallback(async()=>{const token=++request.current;try{const r=await workspaceNavigation(channel.id);if(token!==request.current)return;if(r.data){setNavigation(r.data);setError("");}else{setError(r.error||"Navigation unavailable.");if(r.denied)setNavigation(old=>({...old,channels:[],categories:[],unread:[],mentions:[]}));}}catch{if(token===request.current)setError("Navigation unavailable. Please retry.");}},[channel.id]);
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
 const sidebar=(close?:()=>void)=><CommunityChannelSidebar data={navigation} name={community.name} slug={community.slug} active={channel.id} onNavigate={close}/>;
 return <div className={`community-chat-workspace ${showMembers?"with-members":""}`}>
 <div className="workspace-community-banner"><CommunityBanner community={community}/></div>
 <div className="community-chat-workspace-panes"><aside className="workspace-channels-desktop" aria-label="Channel directory">{sidebar()}</aside>
 <section className="workspace-conversation" aria-label={`${channel.name} channel`}><header className="workspace-channel-header">
 <button className="icon-button workspace-channels-toggle" aria-label="Open channels" onClick={()=>channelsDialog.current?.showModal()}><Menu size={20}/></button>
 <div className="workspace-channel-title"><h1 aria-label={`${channel.kind === "text" ? "#" : "◉"} ${channel.name}`}>{channel.kind==="voice"?<Volume2 size={21}/>:<Hash size={21}/>}<span>{channel.name}</span>{channel.is_private&&<small>Private</small>}</h1>{channel.description&&<p>{channel.description}</p>}</div>
 <Link className="workspace-community-back" href={`/communities/${community.slug}`}>← {community.name}</Link>
 <button className="icon-button workspace-members-toggle" aria-label={narrow?"Open community members":showMembers?"Hide community members":"Show community members"} aria-expanded={narrow?membersOpen:showMembers} onClick={()=>{if(narrow){setMembersOpen(true);membersDialog.current?.showModal();}else setShowMembers(!showMembers);}}>{showMembers&&!narrow?<PanelRightClose size={20}/>:<Users size={20}/>}</button>
 </header>{error&&<p className="workspace-navigation-error" role="alert">{error} <button className="chat-text-button" onClick={()=>void refresh()}>Retry navigation</button></p>}
 <div className="workspace-conversation-body">{children}</div>
 </section>
 {showMembers&&!narrow&&<aside className="workspace-members-desktop" aria-label="Community members"><WorkspaceMembers key={channel.id} channel={channel.id}/><Link className="workspace-member-directory" href={`/members?community=${community.id}`}>Browse community members · Add friends</Link></aside>}
 </div>
 <dialog ref={channelsDialog} className="workspace-drawer workspace-channel-drawer" aria-label="Channels"><header><h2>Channels</h2><button className="icon-button" aria-label="Close channels" onClick={()=>channelsDialog.current?.close()}><X size={20}/></button></header>{sidebar(()=>channelsDialog.current?.close())}</dialog>
 <dialog ref={membersDialog} className="workspace-drawer workspace-members-drawer" aria-label="Members" onClose={()=>setMembersOpen(false)}><header><h2>Members</h2><button className="icon-button" aria-label="Close members" onClick={()=>membersDialog.current?.close()}><X size={20}/></button></header>{membersOpen&&<WorkspaceMembers key={channel.id} channel={channel.id}/>}<Link className="button secondary" href={`/members?community=${community.id}`} onClick={()=>membersDialog.current?.close()}>Browse community members · Add friends</Link></dialog>
 </div>;
}
