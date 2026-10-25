"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { RealtimeClient, type RealtimeChannel } from "@supabase/supabase-js";
import { getChanges } from "../../lib/chat/actions";
import { getChatState, getConversationPage, getReceiptSnapshot } from "../../lib/chat/reliability";
import { reconcileMessages } from "../../lib/chat/reconcile";
import type { ChatMessage, ChatPage, ChatState, DeliveryChange, PendingMessage } from "../../lib/chat/types";
export function useChannelChat({ channelId, userId, initial, url, publishableKey }: { channelId:string;userId:string;initial:ChatPage;url:string;publishableKey:string }) {
  const [messages,setMessages]=useState(initial.messages),[pending,setPending]=useState<PendingMessage[]>([]);
  const [status,setStatus]=useState("Connecting"),[denied,setDenied]=useState(false),[canPost,setCanPost]=useState(false),[role,setRole]=useState("member");
  const [refreshVersion,setRefreshVersion]=useState(0),[generation,setGeneration]=useState(0),[recoveryPage,setRecoveryPage]=useState<ChatPage|null>(null);
  const [unread,setUnread]=useState(initial.unread_count),[lastRead,setLastRead]=useState(initial.last_read_seq);
  const [syncError,setSyncError]=useState("");
  const [typing,setTyping]=useState<Record<string,{name:string;until:number}>>({});
  const alive=useRef(true),allowed=useRef(true),epoch=useRef(0),socketReady=useRef(false),wasDenied=useRef(false);
  const cursor=useRef(initial.watermark),read=useRef(initial.last_read_seq),stateVersion=useRef(initial.watermark);
  const busy=useRef(false),again=useRef(false),stateBusy=useRef(false),stateAgain=useRef(false);
  const visibleTimer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
  const visible=useRef(new Map<string,string[]>()),retryTimer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined),failures=useRef(0),connectionFailures=useRef(0);
  const catchUpRef=useRef<()=>Promise<void>>(async()=>{});
  const localTyping=useRef({active:false,last:0});
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;allowed.current=false;// Monotonic authorization generation, not a DOM ref.
// eslint-disable-next-line react-hooks/exhaustive-deps
epoch.current++;clearTimeout(retryTimer.current);clearTimeout(visibleTimer.current);};},[]);
  const valid=useCallback((token:number)=>alive.current&&allowed.current&&token===epoch.current,[]);
  const merge=useCallback((items:ChatMessage[])=>{if(alive.current&&allowed.current)setMessages(previous=>reconcileMessages(previous,items.filter(m=>m.channel_id===channelId)));},[channelId]);
  const lock=useCallback(()=>{epoch.current++;allowed.current=false;wasDenied.current=true;socketReady.current=false;clearTimeout(retryTimer.current);setDenied(true);setCanPost(false);setMessages([]);setPending([]);setTyping({});setStatus("Access unavailable");},[]);
  const applyState=useCallback((data:ChatState)=>{
    if(!alive.current||!allowed.current||BigInt(data.last_read_seq)<BigInt(read.current)||BigInt(data.watermark)<BigInt(stateVersion.current))return;
    read.current=data.last_read_seq;stateVersion.current=data.watermark;setLastRead(data.last_read_seq);setUnread(data.unread_count);setRefreshVersion(value=>value+1);
  },[]);
  const refresh=useCallback(async()=>{
    if(!alive.current||!allowed.current)return;
    if(stateBusy.current){stateAgain.current=true;return;}
    stateBusy.current=true;const token=epoch.current;
    try{do{stateAgain.current=false;const result=await getChatState(channelId);if(!valid(token))return;if(result.denied){lock();return;}if(!result.data){setSyncError(result.error??"Read state unavailable.");throw Error("State unavailable");}setSyncError("");applyState(result.data);}while(stateAgain.current&&valid(token));}
    finally{stateBusy.current=false;}
  },[channelId,valid,lock,applyState]);
  const receiptSnapshot=useCallback(async()=>{
    const token=epoch.current;if(!valid(token))return;
    const ids=[...new Set([...visible.current.values()].flat())].slice(0,100);
    if(!ids.length)return;
    try{const result=await getReceiptSnapshot(channelId,ids);if(!valid(token))return;if(result.denied){lock();return;}if(result.data){const counts=new Map(result.data.map(item=>[item.id,item.read_count]));setMessages(previous=>previous.map(message=>counts.has(message.id)&&message.read_count!==counts.get(message.id)?{...message,read_count:counts.get(message.id)!}:message));}}catch{/* The next receipt/reauthorization refresh retries; do not invent read counts. */}
  },[channelId,lock,valid]);
  const catchUp=useCallback(async()=>{
    if(!alive.current||!allowed.current)return;
    if(busy.current){again.current=true;return;}
    busy.current=true;const token=epoch.current;let more=false;
    try{
      do{again.current=false;
        // Bound each turn, but never skip revisions or discard already-loaded history.
        for(let pages=0;pages<5;pages++){
          const result=await getChanges(channelId,cursor.current);if(!valid(token))return;
          if(result.denied){lock();return;}if(!result.data)throw Error("Catch-up unavailable");
          merge(result.data);for(const item of result.data)if(BigInt(item.version)>BigInt(cursor.current))cursor.current=item.version;
          more=result.data.length===200;if(!more)break;
        }
      }while(again.current&&!more&&valid(token));
      await refresh();if(!valid(token))return;
      failures.current=0;
      if(more){setStatus("Synchronizing");clearTimeout(retryTimer.current);retryTimer.current=setTimeout(()=>void catchUpRef.current(),100);}
      else if(socketReady.current&&navigator.onLine)setStatus("Live");
    }catch{
      if(valid(token)){setStatus(navigator.onLine?"Reconnecting":"Offline");clearTimeout(retryTimer.current);const wait=Math.min(30000,1000*2**Math.min(failures.current++,5));retryTimer.current=setTimeout(()=>void catchUpRef.current(),wait);}
    }finally{busy.current=false;if(again.current&&alive.current&&allowed.current){again.current=false;clearTimeout(retryTimer.current);retryTimer.current=setTimeout(()=>void catchUpRef.current(),100);}}
  },[channelId,lock,merge,refresh,valid]);
  catchUpRef.current=catchUp;
  const delivery=useCallback((change:DeliveryChange)=>{
    if(!alive.current||!allowed.current)return;
    setPending(previous=>change.type==="start"?[...previous.filter(m=>m.id!==change.message.id),change.message]:change.type==="failed"?previous.map(m=>m.id===change.id?{...m,status:"failed",error:change.error}:m):previous.filter(m=>m.id!==change.id));
  },[]);
  const watchVisible=useCallback((scope:string,ids:string[])=>{if(ids.length)visible.current.set(scope,ids.slice(0,80));else visible.current.delete(scope);if(visibleTimer.current)return;visibleTimer.current=setTimeout(()=>{visibleTimer.current=undefined;void receiptSnapshot();},160);},[receiptSnapshot]);
  useEffect(()=>{
    let stopped=false,connecting=false,topic="",socket:RealtimeClient|undefined,subscription:RealtimeChannel|undefined;
    let eventTimer:ReturnType<typeof setTimeout>|undefined,connectTimer:ReturnType<typeof setTimeout>|undefined;
    const invalidate=()=>{if(eventTimer||stopped)return;eventTimer=setTimeout(()=>{eventTimer=undefined;if(!stopped)void catchUp();},80);};
    const reconnect=()=>{if(stopped||connectTimer)return;connectTimer=setTimeout(()=>{connectTimer=undefined;if(!stopped)setGeneration(value=>value+1);},Math.min(30000,1000*2**Math.min(connectionFailures.current++,5)));};
    async function connect(){
      if(stopped||connecting)return;if(!navigator.onLine){setStatus("Offline");return;}
      connecting=true;const token=epoch.current;
      try{
        const response=await fetch(`/api/chat/session?channel=${channelId}`,{cache:"no-store"});if(stopped||token!==epoch.current)return;
        if(response.status===401||response.status===403){lock();if(subscription&&socket)await socket.removeChannel(subscription);return;}
        if(!response.ok)throw Error("Session unavailable");const session=await response.json();if(stopped||token!==epoch.current)return;
        if(typeof session.topic!=="string"||typeof session.access_token!=="string")throw Error("Invalid session");
        allowed.current=true;setCanPost(session.can_post===true);setRole(session.role??"member");
        if(wasDenied.current){const page=await getConversationPage({channelId});if(stopped||token!==epoch.current)return;if(!page.data)throw Error("History unavailable");setMessages(page.data.messages);cursor.current=page.data.watermark;setRecoveryPage(page.data);read.current=page.data.last_read_seq;stateVersion.current=page.data.watermark;wasDenied.current=false;}
        setDenied(false);
        if(!socket)socket=new RealtimeClient(new URL("/realtime/v1",url).href,{params:{apikey:publishableKey,eventsPerSecond:10}});
        await socket.setAuth(session.access_token);if(stopped||token!==epoch.current)return;
        if(subscription&&topic===session.topic){if(subscription.state==="joined"){socketReady.current=true;void catchUp();}else reconnect();return;}
        if(subscription)await socket.removeChannel(subscription);if(stopped||token!==epoch.current)return;
        topic=session.topic;setStatus("Connecting");
        subscription=socket.channel(topic,{config:{private:true,broadcast:{self:false}}})
          .on("broadcast",{event:"changed"},invalidate)
          .on("broadcast",{event:"receipt"},()=>{if(!stopped){void refresh().catch(()=>{});void receiptSnapshot();}})
          .on("broadcast",{event:"access_changed"},()=>{if(stopped)return;epoch.current++;allowed.current=false;socketReady.current=false;setCanPost(false);setTyping({});setStatus("Reauthorizing");setGeneration(value=>value+1);})
          .on("broadcast",{event:"typing"},({payload})=>{
            if(stopped||!allowed.current||payload?.user_id===userId||typeof payload?.user_id!=="string"||payload.user_id.length>36||typeof payload?.name!=="string")return;
            const until=Date.parse(payload.until),now=Date.now();if(!Number.isFinite(until)||until>now+10000)return;
            setTyping(previous=>{if(until<=now){if(!previous[payload.user_id])return previous;const next={...previous};delete next[payload.user_id];return next;}return {...previous,[payload.user_id]:{name:payload.name.slice(0,60),until}};});
          })
          .subscribe(state=>{if(stopped||!allowed.current)return;if(state==="SUBSCRIBED"){socketReady.current=true;connectionFailures.current=0;clearTimeout(connectTimer);connectTimer=undefined;setStatus("Synchronizing");void catchUp();void receiptSnapshot();}else{socketReady.current=false;setStatus(navigator.onLine?"Reconnecting":"Offline");if(navigator.onLine)reconnect();}});
      }catch{if(!stopped){setStatus(navigator.onLine?"Reconnecting":"Offline");reconnect();}}finally{connecting=false;}
    }
    const online=()=>setGeneration(value=>value+1),offline=()=>{socketReady.current=false;setStatus("Offline");setTyping({});};
    const focus=()=>{if(document.visibilityState==="visible"&&navigator.onLine){void connect();invalidate();}};
    window.addEventListener("online",online);window.addEventListener("offline",offline);window.addEventListener("focus",focus);document.addEventListener("visibilitychange",focus);
    const check=setInterval(()=>void connect(),30000);
    // Metadata-only repair covers a healthy socket whose invalidation was missed.
    const reconcile=setInterval(()=>{if(!stopped&&navigator.onLine&&allowed.current)void refresh().then(()=>{if(BigInt(stateVersion.current)>BigInt(cursor.current))invalidate();}).catch(()=>{});},10000);
    const expire=setInterval(()=>setTyping(previous=>{const entries=Object.entries(previous).filter(([,item])=>item.until>Date.now());return entries.length===Object.keys(previous).length?previous:Object.fromEntries(entries);}),1000);
    void connect();
    return()=>{stopped=true;socketReady.current=false;clearInterval(check);clearInterval(reconcile);clearInterval(expire);clearTimeout(eventTimer);clearTimeout(connectTimer);window.removeEventListener("online",online);window.removeEventListener("offline",offline);window.removeEventListener("focus",focus);document.removeEventListener("visibilitychange",focus);if(socket){void socket.removeAllChannels().catch(()=>{});socket.disconnect();}};
  },[channelId,userId,url,publishableKey,generation,catchUp,lock,refresh,receiptSnapshot]);
  const indicateTyping=useCallback((active:boolean)=>{
    if(!navigator.onLine||!allowed.current)return;const now=Date.now(),previous=localTyping.current;
    if(active&&previous.active&&now-previous.last<3000)return;if(!active&&!previous.active)return;
    localTyping.current={active,last:active?now:previous.last};
    void fetch("/api/chat/typing",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({channel:channelId,active}),keepalive:true}).catch(()=>{});
  },[channelId]);
  return {messages,pending,syncError,delivery,watchVisible,recoveryPage,refreshVersion,merge,status,denied,canPost,role,typing:Object.values(typing).map(t=>t.name),unread,lastRead,refresh,applyState,retryConnection:()=>setGeneration(value=>value+1),indicateTyping,lock};
}
