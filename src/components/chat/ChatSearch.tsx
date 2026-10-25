"use client";
import Link from'next/link';
import{useEffect,useRef,useState}from'react';
import{searchCommunity}from'../../lib/chat/navigation';
import type{SearchHit}from'../../lib/chat/navigation-types';
import type{WorkspaceChannel}from'../../lib/chat/workspace';
export function ChatSearch({community,channel,channels,onClose}:{community:string;channel:string;channels:WorkspaceChannel[];onClose:()=>void}){
 const currentText=channels.some(item=>item.id===channel&&item.kind==='text');
 const[query,setQuery]=useState(''),[scope,setScope]=useState(currentText?channel:''),[author,setAuthor]=useState(''),[from,setFrom]=useState(''),[until,setUntil]=useState(''),[threads,setThreads]=useState(true);
 const[items,setItems]=useState<SearchHit[]>([]),[more,setMore]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[searched,setSearched]=useState(false);const generation=useRef(0);
 useEffect(()=>{setScope(currentText?channel:'');setItems([]);setSearched(false);setMore(false);generation.current++;return()=>{
 // Monotonic request generation, not a DOM ref.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 generation.current++;};},[channel,community,currentText]);
 function changed(){generation.current++;setItems([]);setMore(false);setSearched(false);setBusy(false);}
 async function run(older=false){const token=++generation.current;setBusy(true);setError('');try{const r=await searchCommunity({community,channel:scope||null,query,author:author.trim().replace(/^@/,'')||null,from:from||null,until:until||null,threads,before:older?items.at(-1)?.created_seq??null:null});if(token!==generation.current)return;if(r.data){const page=r.data.items;setItems(previous=>older?[...previous,...page.slice(0,30).filter(hit=>!previous.some(old=>old.id===hit.id))]:page.slice(0,30));setMore(page.length>30);setSearched(true);}else{setItems([]);setMore(false);setError(r.error??'Search unavailable.');}}catch{if(token===generation.current)setError('Search unavailable. Please retry.');}finally{if(token===generation.current)setBusy(false);}}
 return <section className="chat-advanced-search" aria-label="Search community messages"><header><h2>Search messages</h2><button type="button" className="chat-text-button" onClick={onClose}>Close search</button></header><form onSubmit={e=>{e.preventDefault();void run();}}>
 <label>Search text<input autoFocus value={query} maxLength={100} onChange={e=>{setQuery(e.target.value);changed();}} placeholder="Words or a quoted phrase"/></label>
 <label>Channel<select aria-label="Channel" value={scope} onChange={e=>{setScope(e.target.value);changed();}}><option value="">All accessible community channels</option>{channels.filter(c=>c.kind==='text').map(c=><option key={c.id} value={c.id}>#{c.name}</option>)}</select></label>
 <label>Member username<input value={author} maxLength={25} placeholder="username" onChange={e=>{setAuthor(e.target.value);changed();}}/></label>
 <label>From date (UTC)<input type="date" value={from} onChange={e=>{setFrom(e.target.value);changed();}}/></label><label>Through date (UTC)<input type="date" value={until} onChange={e=>{setUntil(e.target.value);changed();}}/></label>
 <label className="chat-search-check"><input type="checkbox" checked={threads} onChange={e=>{setThreads(e.target.checked);changed();}}/>Include thread replies</label><button className="button primary" disabled={busy}>Search messages</button>
 </form>{busy&&<p role="status">Searching accessible messages…</p>}{error&&<p role="alert">{error}</p>}{searched&&!items.length&&!busy&&<p>No matching accessible messages.</p>}
 <ol className="chat-search-results">{items.map(hit=><li key={hit.id}><Link href={`/channels/${hit.channel_id}?message=${hit.id}`} onClick={onClose}><span><strong>#{hit.channel_name}</strong>{hit.parent_id?' · Thread reply':''} · {hit.author_name}</span><p>{hit.snippet}</p><time dateTime={hit.created_at}>{new Date(hit.created_at).toLocaleString()}</time></Link></li>)}</ol>{more&&<button type="button" className="button secondary" disabled={busy} onClick={()=>void run(true)}>Older search results</button>}</section>;
}
