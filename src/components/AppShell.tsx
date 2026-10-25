"use client";
import {useCallback,useEffect,useRef,useState,type ReactNode} from 'react';
import Form from 'next/form';
import {Link,NavLink,useLocation} from '../compat/navigation';
import {ArrowUpRight,ChevronLeft,Compass,House,Menu,MessageCircle,Search,Swords,X,Settings,Users,LogOut,Bell,Headphones,CalendarDays} from 'lucide-react';
import {useMember,MemberAvatar} from './MemberContext';
import {logout} from '../lib/auth/actions';
import {PeopleBell,usePeople} from './people/PeopleProvider';
import {navigation} from '../data';
import {Brand,NotificationBell,VoiceConnectionBar} from './ui';
import {CommunityRail} from './navigation/CommunityRail';
import {LoungeContextPanel} from './navigation/LoungeContextPanel';
import {CommunityChannelSidebar} from './chat/CommunityChannelSidebar';
import {shellNavigation} from '../lib/shell/actions';
import type {ShellData} from '../lib/shell/types';

export function Sidebar({onNavigate}:{onNavigate?:()=>void;collapsed?:boolean;onToggle?:()=>void}){
 const member=useMember();
 const primary=[
 {to:'/home',label:'Home',icon:House},{to:'/communities',label:'Explore Communities',icon:Compass},
 {to:'/voice',label:'Hangouts',icon:Headphones},{to:'/events',label:'Gatherings',icon:CalendarDays},
 {to:'/announcements',label:'Announcements',icon:Bell},{to:'/communities?filter=joined',label:'My Communities',icon:Users},
 {to:'/messages',label:'Messages',icon:MessageCircle}];
 const more=navigation.filter(item=>!primary.some(p=>p.to===item.to));
 return <><header className="lounge-navigation-heading"><Brand to="/home"/><p>Find Your People.<br/>Find Your Place.</p></header><nav className="main-navigation" aria-label="Main navigation">{primary.map(item=><NavLink key={item.to} to={item.to} onClick={onNavigate}><item.icon size={19}/><span>{item.label}</span></NavLink>)}<p className="nav-section">MORE TO EXPLORE</p>{more.map(item=><NavLink key={item.to} to={item.to} onClick={onNavigate}><item.icon size={19}/><span>{item.label}</span></NavLink>)}</nav><div className="sidebar-bottom"><VoiceConnectionBar/><Link className="self-profile" to="/profile" onClick={onNavigate}><MemberAvatar/><span><strong>{member?.name||'Member'}</strong><small>@{member?.username||'Your account'}</small></span></Link><form action={logout}><button className="logout-button" type="submit"><LogOut size={17}/>Sign out</button></form></div></>;
}
export function Topbar({onMenu,onActivity,expanded}:{onMenu:()=>void;onActivity:()=>void;expanded:boolean}){
 const location=useLocation(),people=usePeople();const labels:Record<string,string>={'/voice':'Hangouts','/events':'Gatherings','/communities':'Explore','/announcements':'Announcements'};
 const current=navigation.find(item=>location.pathname.startsWith(item.to));
 const dm=people?.home?.conversations.reduce((sum,c)=>sum+(c.muted?0:Number(c.unread)),0)||0;
 return <header className="topbar"><div className="breadcrumb"><button className="icon-button mobile-menu-button" onClick={onMenu} aria-label="Open navigation" aria-expanded={expanded}><Menu size={21}/></button><span className="breadcrumb-root">Your space</span><ChevronLeft className="breadcrumb-divider" size={13}/><span>{labels[location.pathname]||current?.label||'The Gathering'}</span></div><Form action="/communities" className="lounge-search" role="search"><Search size={17} aria-hidden="true"/><input type="search" name="q" aria-label="Search communities" placeholder="Find your people…" maxLength={100}/><button type="submit" aria-label="Search communities"><ArrowUpRight size={16}/></button></Form><div className="topbar-actions">{people?<PeopleBell/>:<NotificationBell/>}<Link to="/messages" className="icon-button" aria-label={`Direct messages: ${dm} unread`}><MessageCircle size={20}/>{dm>0&&<span className="badge">{dm>99?'99+':dm}</span>}</Link><Link to="/settings" className="icon-button" aria-label="Settings"><Settings size={20}/></Link><Link to="/profile" aria-label="Open your profile"><MemberAvatar size="small"/></Link><button className="icon-button lounge-activity-toggle" aria-label="Open activity" onClick={onActivity}><Users size={20}/></button></div></header>;
}
export function MobileNavigation({onMenu}:{onMenu:()=>void}){
 return <><VoiceConnectionBar mobile/><nav className="mobile-navigation" aria-label="Mobile navigation">{[{to:'/home',label:'Home',icon:House},{to:'/communities',label:'Discover',icon:Compass},{to:'/squad-up',label:'Squad Up',icon:Swords},{to:'/messages',label:'Messages',icon:MessageCircle}].map(item=><NavLink key={item.to} to={item.to}><item.icon size={20}/><span>{item.label}</span></NavLink>)}<button onClick={onMenu} aria-label="Open all pages"><Menu size={20}/><span>More</span></button></nav></>;
}
export function AppShell({children}:{children:ReactNode}){
 const [collapsed,setCollapsed]=useState(false),[channelNavExpanded,setChannelNavExpanded]=useState(false),[drawer,setDrawer]=useState(false);
 const [loaded,setLoaded]=useState<{path:string;data:ShellData}|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[limit,setLimit]=useState(30),[revision,setRevision]=useState(0),[compact,setCompact]=useState(true),[activityOpen,setActivityOpen]=useState(false);
 const activityDialog=useRef<HTMLDialogElement>(null),people=usePeople(),generation=useRef(0);
 const location=useLocation(),channelMode=/^\/channels\/[a-f0-9-]{36}$/.test(location.pathname);
 const data=loaded?.data??null,context=loaded?.path===location.pathname?data?.context:null;
 const refresh=useCallback(()=>setRevision(v=>v+1),[]);
 useEffect(()=>{let live=true;const token=++generation.current;setLoading(true);void shellNavigation(location.pathname,limit).then(result=>{if(!live||token!==generation.current)return;if(result.data){setLoaded({path:location.pathname,data:result.data});setError('');}else{setLoaded(null);setError(result.error||'Navigation unavailable.');}}).catch(()=>{if(live&&token===generation.current){setLoaded(null);setError('Navigation unavailable.');}}).finally(()=>{if(live&&token===generation.current)setLoading(false);});return()=>{live=false;};},[location.pathname,revision,limit]);
 useEffect(()=>{const update=()=>setCompact(matchMedia('(max-width:1399px)').matches);update();window.addEventListener('resize',update);return()=>window.removeEventListener('resize',update);},[]);
 useEffect(()=>{const update=()=>{if(document.visibilityState==='visible'&&navigator.onLine)refresh();};const access=()=>{generation.current++;setLoaded(null);refresh();};const timer=setInterval(update,30000);window.addEventListener('online',update);window.addEventListener('gathering:chat-access-changed',access);window.addEventListener('gathering:communities-changed',access);return()=>{clearInterval(timer);window.removeEventListener('online',update);window.removeEventListener('gathering:chat-access-changed',access);window.removeEventListener('gathering:communities-changed',access);};},[refresh]);
 useEffect(()=>{if(!people?.chatRevision)return;const timer=setTimeout(refresh,1500);return()=>clearTimeout(timer);},[people?.chatRevision,refresh]);
 const activityPath=useRef(location.pathname);
 useEffect(()=>{if(activityPath.current===location.pathname)return;activityPath.current=location.pathname;setDrawer(false);activityDialog.current?.close();setActivityOpen(false);},[location.pathname]);
  const shellRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!channelMode) return;
    let focusFrame = 0;
    let pointerActive = false;
    const update = () => {
      const shell = shellRef.current;
      if (!shell) return;
      shell.style.setProperty("--channel-viewport", `${window.visualViewport?.height || window.innerHeight}px`);
      if (pointerActive) return;
      const active = document.activeElement;
      const editing = active?.matches("input,textarea,[contenteditable=true]") || (shell.dataset.editing === "true" && active?.closest("form")?.querySelector("input,textarea,[contenteditable=true]"));
      // Keep controls steady while focus moves from an input to Send/Save.
      shell.dataset.editing = editing ? "true" : "false";
    };
    const focusChanged = () => { cancelAnimationFrame(focusFrame); focusFrame = requestAnimationFrame(update); };
    const pointerDown = () => { pointerActive = true; };
    const pointerUp = () => { pointerActive = false; focusChanged(); };
    update();
    document.addEventListener("pointerdown", pointerDown, true);
    document.addEventListener("pointerup", pointerUp, true);
    document.addEventListener("pointercancel", pointerUp, true);
    window.visualViewport?.addEventListener("resize", update);
    window.visualViewport?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    document.addEventListener("focusin", focusChanged);
    document.addEventListener("focusout", focusChanged);
    return () => {
      window.visualViewport?.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      document.removeEventListener("focusin", focusChanged);
      document.removeEventListener("focusout", focusChanged);
      cancelAnimationFrame(focusFrame);
      document.removeEventListener("pointerdown", pointerDown, true);
      document.removeEventListener("pointerup", pointerUp, true);
      document.removeEventListener("pointercancel", pointerUp, true);
    };
  }, [channelMode]);
  const drawerRef = useRef<HTMLElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const mainRef = useRef<HTMLElement>(null);
  const previousPath = useRef(location.pathname);
  useEffect(() => {
    if (previousPath.current !== location.pathname) mainRef.current?.focus();
    previousPath.current = location.pathname;
  }, [location.pathname]);
  useEffect(() => {
    if (!drawer) return;
    const priorOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const panel = drawerRef.current;
    panel?.querySelector<HTMLElement>("button, a")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setDrawer(false);
        return;
      }
      if (e.key !== "Tab") return;
      const focusable = panel?.querySelectorAll<HTMLElement>(
        "a[href], button:not([disabled])",
      );
      if (!focusable?.length) return;
      const first = focusable[0],
        last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
      if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = priorOverflow;
      document.removeEventListener("keydown", onKey);
      returnFocus.current?.focus();
    };
  }, [drawer]);
  const openDrawer = () => {
    returnFocus.current = document.activeElement as HTMLElement;
    setDrawer(true);
  };

 const rail=(close?:()=>void)=><CommunityRail data={loaded?.path===location.pathname?data:data?{...data,selected:null}:null} loading={loading} error={error} onRetry={refresh} onNavigate={close} expanded={channelMode?channelNavExpanded:!collapsed} onToggle={()=>channelMode?setChannelNavExpanded(!channelNavExpanded):setCollapsed(!collapsed)} onMore={()=>setLimit(v=>Math.min(200,v+30))}/>;
 const secondary=(close?:()=>void)=>context?.navigation?<><CommunityChannelSidebar data={context.navigation} name={context.community.name} slug={context.community.slug} image={context.community.image??undefined} active="" onNavigate={close}/></>:<Sidebar onNavigate={close}/>;
 return <div ref={shellRef} className={`app-shell premium-shell ${collapsed?'secondary-collapsed':''} ${channelMode?'channel-mode':''} ${channelMode&&!channelNavExpanded?'is-collapsed':''}`}>
 <a className="skip-link" href="#main-content">Skip to content</a>
 <div className="desktop-community-rail">{rail()}</div>
 {(!channelMode||channelNavExpanded)&&<aside className={`desktop-sidebar ${channelMode?'channel-global-overlay':''}`} aria-label="Lounge navigation">{channelMode?<Sidebar/>:secondary()}</aside>}
 <div className="app-body" inert={drawer?true:undefined}><Topbar onMenu={openDrawer} expanded={drawer} onActivity={()=>{setActivityOpen(true);activityDialog.current?.showModal();}}/><div className="workspace-layout"><main id="main-content" ref={mainRef} tabIndex={-1}>{children}</main>{!channelMode&&!compact&&<LoungeContextPanel key={context?.community.id||'explore'} community={context?.community}/>}</div></div>
 {!channelMode&&collapsed&&<div className="shell-floating-connection"><VoiceConnectionBar/></div>}
 <div inert={drawer?true:undefined}><MobileNavigation onMenu={openDrawer}/></div>
 {drawer&&<div className="drawer-overlay" onClick={()=>setDrawer(false)}><aside ref={drawerRef} className="mobile-drawer lounge-navigation-drawer" role="dialog" aria-modal="true" aria-label="All pages" onClick={event=>event.stopPropagation()}><button className="icon-button drawer-close" onClick={()=>setDrawer(false)} aria-label="Close navigation"><X size={21}/></button><div className="drawer-community-rail">{rail(()=>setDrawer(false))}</div><div className="drawer-secondary"><Sidebar onNavigate={()=>{returnFocus.current=null;setDrawer(false);}}/></div></aside></div>}
 <dialog ref={activityDialog} className="lounge-activity-dialog" aria-label="Around the gathering" onClose={()=>{if(!activityDialog.current?.open)setActivityOpen(false);}}><button className="icon-button" aria-label="Close activity" onClick={()=>activityDialog.current?.close()}><X size={20}/></button>{activityOpen&&<LoungeContextPanel key={context?.community.id||'explore'} community={context?.community}/>}</dialog>
 </div>;
}
