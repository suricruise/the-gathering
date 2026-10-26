"use client";
import { useEffect, useState } from "react";
import { Announcements } from "../components/admin/MemberSafety";
import {
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  ChevronRight,
  Compass,
  Gamepad2,
  HeartHandshake,
  Sparkles,
  Swords,
  Users,
} from "lucide-react";
import { Link } from "../compat/navigation";
import { useMember } from "../components/MemberContext";
import { UpcomingEvents } from "../components/spaces/Spaces";
import { Brand, SectionHeading, EmptyState } from "../components/ui";

import {LoungeHero} from '../components/discovery/LoungeHero';
import {LoungeCommunityCard} from '../components/discovery/CommunityCard';
import {HappeningNow} from '../components/discovery/HappeningNow';
import {interestCategories,rankPopular,recentPublic,type DiscoveryCommunity} from '../lib/discovery/model';
import {discoverySummary,type DiscoverySummary} from '../lib/discovery/actions';
export function Home({featured=[],memberships=[],summary:initialSummary,unavailable=false,directoryUnavailable=false}:{featured?:DiscoveryCommunity[];memberships?:{community_id:string;status:string}[];summary?:DiscoverySummary;unavailable?:boolean;directoryUnavailable?:boolean}) {
 const [summary,setSummary]=useState(initialSummary);
 useEffect(()=>setSummary(initialSummary),[initialSummary]);
 useEffect(()=>{let live=true;let generation=0;const load=()=>{const token=++generation;void discoverySummary().then(r=>{if(live&&token===generation)setSummary(r.data);}).catch(()=>{if(live&&token===generation)setSummary(undefined);});};const update=()=>{if(document.visibilityState==='visible'&&navigator.onLine)load();};const revoke=()=>{generation++;setSummary(undefined);update();};const timer=setInterval(update,60000);window.addEventListener('online',update);window.addEventListener('gathering:chat-access-changed',revoke);window.addEventListener('gathering:communities-changed',revoke);return()=>{live=false;clearInterval(timer);window.removeEventListener('online',update);window.removeEventListener('gathering:chat-access-changed',revoke);window.removeEventListener('gathering:communities-changed',revoke);};},[]);
 const communities=featured.filter(c=>c.visibility!=='private'||summary?.items.some(s=>s.id===c.id)).map(c=>({...c,stats:summary?.items.find(s=>s.id===c.id)}));
 const member=useMember();const joined=new Set(memberships.filter(m=>m.status==='active').map(m=>m.community_id));const popular=rankPopular(communities),recent=recentPublic(communities);const mine=communities.filter(c=>joined.has(c.id));
 return <div className="page home-page lounge-home-page">
 <Announcements/><div className="page-heading"><div><p className="eyebrow">MAKE YOURSELF AT HOME</p><h1>Good to see you, {member?.name.split(' ')[0]||'friend'} <span aria-hidden="true">✦</span></h1><p className="muted">Your next conversation starts here.</p></div><span className="date-label"><CalendarDays size={15}/><CurrentDate/></span></div>
 <LoungeHero/>{directoryUnavailable&&<p role="status" className="panel padded">Communities could not be loaded. <Link to="/communities">Open Explore to retry</Link>.</p>}{unavailable&&<p role="status" className="panel padded">Community activity and categories could not be loaded. <Link to="/communities">Browse communities</Link> or refresh to retry.</p>}
 <HappeningNow summary={summary}/>{summary&&<p className="lounge-snapshot-note">Activity refreshes about once a minute while this page is visible. Online counts reflect members sharing their status.</p>}
 <section className="home-section"><SectionHeading title="Featured communities" to="/communities" label="Explore communities"/><p className="section-subtitle">Places chosen in the community directory’s curated order.</p>{communities.length?<div className="lounge-featured-grid">{communities.slice(0,2).map(c=><LoungeCommunityCard key={c.id} community={c} joined={joined.has(c.id)}/>)}</div>:<EmptyState title={directoryUnavailable?"Communities are unavailable":"Your next community is waiting"} description={directoryUnavailable?"Please retry shortly.":"Browse available communities or return soon for new places to connect."}/>}</section>
 <section className="home-section"><SectionHeading title="Popular right now" to="/communities" label="See all communities"/><p className="section-subtitle">Recent messages and published community posts you can access, over the last seven days. Activity is sampled, not a platform-wide ranking.</p>{popular.length?<div className="lounge-popular-grid">{popular.map(c=><LoungeCommunityCard key={c.id} community={c} joined={joined.has(c.id)} compact/>)}</div>:<div className="panel padded"><p>{summary?'No recent activity to rank yet. Be the start of something good.':'Popularity is unavailable while community activity loads.'}</p></div>}</section>
 <section className="home-section"><SectionHeading title="Explore by interest" to="/communities" label="All interests"/><div className="lounge-interest-grid">{interestCategories.map(([id,label])=><Link key={id} to={`/communities?interest=${id}`} className="lounge-interest"><span className="lounge-interest-symbol" aria-hidden="true">{interestSymbols[id]}</span><strong>{label}</strong><ArrowUpRight size={16}/></Link>)}</div></section>
 <div className="home-lower-grid"><section><SectionHeading title="On the horizon" to="/events" label="All events"/><p className="section-subtitle">Upcoming activities in your communities.</p><div className="panel upcoming-events"><UpcomingEvents/></div></section><section><SectionHeading title="Recent community activity" to="/feed" label="Open feed"/><div className="panel padded lounge-recent-posts">{summary?.recent.length?<ul>{summary.recent.map(p=><li key={p.id}><Link to={`/feed/${p.id}`}><strong>{featured.find(c=>c.id===p.community_id)?.name||'Community update'}</strong><span>{p.body||'Shared media'}</span></Link></li>)}</ul>:<p className="muted">{summary?'No recent community posts to show.':'Community activity is unavailable.'}</p>}<Link className="text-link" to="/feed">Share a moment <ArrowRight size={15}/></Link></div></section></div>
 <section className="home-section"><SectionHeading title="Recently added" to="/communities" label="Explore new places"/><p className="section-subtitle">The newest public communities in your accessible directory.</p>{recent.length?<div className="community-grid">{recent.map(c=><LoungeCommunityCard key={c.id} community={c} joined={joined.has(c.id)}/>)}</div>:<div className="panel padded"><p>{summary?'No new public communities to show yet.':'New-community dates are unavailable. Browse the directory to explore.'}</p></div>}</section>
 <section className="home-section"><SectionHeading title="My communities" to="/communities?filter=joined" label="All my communities"/>{mine.length?<div className="lounge-popular-grid">{mine.slice(0,6).map(c=><LoungeCommunityCard key={c.id} community={c} joined compact/>)}</div>:<div className="panel padded"><h3>{directoryUnavailable?"Your communities are unavailable":"Find a place to belong."}</h3><p className="muted">{directoryUnavailable?"Your memberships could not be loaded. Please retry.":"Join a community to keep your conversations close."}</p><Link className="button secondary" to="/communities">Explore communities</Link></div>}</section>
 <div className="quick-actions"><Link to="/squad-up"><Swords size={21}/><span><strong>Find your squad</strong><small>Play something together</small></span><ArrowUpRight size={17}/></Link><Link to="/voice"><Users size={21}/><span><strong>Come hang out</strong><small>There’s room for you</small></span><ArrowUpRight size={17}/></Link><Link to="/faith"><HeartHandshake size={21}/><span><strong>A little encouragement</strong><small>Faith &amp; Life</small></span><ArrowUpRight size={17}/></Link></div>
 <footer className="page-footer"><nav aria-label="Policies"><Link to="/install">Install app</Link> · <Link to="/terms">Terms</Link> · <Link to="/privacy">Privacy</Link> · <Link to="/community-rules">Community rules</Link></nav><span><Sparkles size={13}/>You belong here. Just as you are.</span><Link to="/">About The Gathering<ChevronRight size={13}/></Link></footer>
 </div>;
}
const interestSymbols:Record<string,string>={conversation:'◌',gaming:'✦','movies-tv':'▷',music:'♫','books-comics':'▤',creativity:'✧',technology:'⌘',sports:'◎','faith-life':'♡',lifestyle:'☼'};
export function Landing() {
  return (
    <div className="landing">
      <a className="skip-link" href="#welcome-content">
        Skip to content
      </a>
      <header className="landing-header">
        <Brand />
        <nav aria-label="Welcome navigation">
          <Link to="/communities">Discover</Link>
          <Link to="/faith">Our heart</Link>
          <Link to="/install">Install app</Link>
          <Link className="button secondary" to="/login">
            Sign in
            <ArrowUpRight size={16} />
          </Link>
        </nav>
      </header>
      <main id="welcome-content" className="landing-main">
        <div className="welcome-hero">
          <div className="welcome-copy">
            <span className="hero-eyebrow">
              <span />A PLACE TO PLAY. A PLACE TO BELONG.
            </span>
            <h1>
              Your people.
              <br />
              Your purpose.
              <br />
              <span>Your gathering.</span>
            </h1>
            <p>
              Some connections are bigger than the game.
              <br />A welcoming home for gamers to find friendship,
              <br className="desktop-break" /> grow in faith, and do life
              together.
            </p>
            <div className="welcome-actions">
              <Link to="/register" className="button primary large-button">
                Find your gathering
                <ArrowRight size={19} />
              </Link>
              <Link to="/communities" className="text-link">
                Find your people
                <Compass size={18} />
              </Link>
            </div>
            <span className="welcome-note">
              An 18+ community. Verify your email to get started.
            </span>
          </div>
          <div className="welcome-art" aria-hidden="true">
            <div className="welcome-orbit orbit-a" />
            <div className="welcome-orbit orbit-b" />
            <div className="welcome-core">
              <span className="core-star">✦</span>
              <Gamepad2 size={98} strokeWidth={1} />
            </div>
            <span className="floating-label label-one">
              <Users size={18} />A place to belong
            </span>
            <span className="floating-label label-two">
              <HeartHandshake size={18} />
              Grounded in faith
            </span>
            <span className="welcome-spark">✦</span>
          </div>
        </div>
        <div className="welcome-values">
          <article>
            <span>01 / PLAY</span>
            <h2>Find your next squad.</h2>
            <p>
              From ranked matches to cozy builds, meet people who make every
              session better.
            </p>
          </article>
          <article>
            <span>02 / CONNECT</span>
            <h2>More than a username.</h2>
            <p>
              Share the wins, the real conversations, and all the little moments
              in between.
            </p>
          </article>
          <article>
            <span>03 / GROW</span>
            <h2>Room for your whole life.</h2>
            <p>
              A faith-rooted community with open doors. Come as you are,
              questions and all.
            </p>
          </article>
        </div>
      </main>
      <footer className="landing-footer"><nav aria-label="Policies"><Link to="/install">Install app</Link> · <Link to="/terms">Terms</Link> · <Link to="/privacy">Privacy</Link> · <Link to="/community-rules">Community rules</Link></nav>
        <Brand />
        <span>Good games. Even better people.</span>
        <Link to="/home">
          Enter The Gathering
          <ArrowRight size={15} />
        </Link>
      </footer>
    </div>
  );
}

function CurrentDate() {
  const [date, setDate] = useState("Today");
  useEffect(() => {
    setDate(
      new Intl.DateTimeFormat(undefined, {
        weekday: "long",
        month: "long",
        day: "numeric",
      }).format(new Date()),
    );
  }, []);
  return <>{date}</>;
}
