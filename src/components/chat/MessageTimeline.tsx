"use client";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { useVirtualizer, defaultRangeExtractor } from "@tanstack/react-virtual";
import type { ChatMessage } from "../../lib/chat/types";
export function MessageTimeline({ messages, scrollRef, scope, onVisible, renderMessage, targetId }: { messages: ChatMessage[]; scrollRef: RefObject<HTMLDivElement | null>; scope: string; onVisible: (scope: string, ids: string[]) => void; renderMessage: (message: ChatMessage, index: number) => ReactNode; targetId?: string }) {
  const element = useRef<HTMLDivElement>(null), [margin,setMargin] = useState(0);
  const enabled = messages.length > 120;
  const virtual = useVirtualizer({ enabled, count: messages.length, rangeExtractor: range => { const indices=defaultRangeExtractor(range); const target=targetId?messages.findIndex(message=>message.id===targetId):-1;return target<0||indices.includes(target)?indices:[...indices,target].sort((a,b)=>a-b); }, getScrollElement: () => scrollRef.current, estimateSize: () => 112, overscan: 12, anchorTo: "end", followOnAppend: false, getItemKey: index => messages[index].id, scrollMargin: margin, useAnimationFrameWithResizeObserver: true });
  useLayoutEffect(()=>{if(!enabled||!element.current||!scrollRef.current)return;setMargin(element.current.getBoundingClientRect().top-scrollRef.current.getBoundingClientRect().top+scrollRef.current.scrollTop);},[enabled,messages.length,scrollRef]);
  const [normalIds,setNormalIds]=useState("");
  useEffect(()=>{
    if(enabled)return;const scroll=scrollRef.current,root=element.current;if(!scroll||!root)return;let frame:number|undefined;
    const update=()=>{if(frame!==undefined)return;frame=requestAnimationFrame(()=>{frame=undefined;const box=scroll.getBoundingClientRect();const next=!scroll.clientHeight?"":Array.from(root.children).filter(row=>{const rect=row.getBoundingClientRect();return rect.bottom>box.top&&rect.top<box.bottom;}).map(row=>messages[Number((row as HTMLElement).dataset.index)]?.id).filter(Boolean).slice(0,80).join("|");setNormalIds(previous=>previous===next?previous:next);});};
    const observer=typeof ResizeObserver!=="undefined"?new ResizeObserver(update):null;observer?.observe(scroll);observer?.observe(root);scroll.addEventListener("scroll",update,{passive:true});update();
    return()=>{if(frame!==undefined)cancelAnimationFrame(frame);observer?.disconnect();scroll.removeEventListener("scroll",update);};
  },[enabled,messages,scrollRef]);
  const items=virtual.getVirtualItems();
  const ids=enabled?items.map(item=>messages[item.index].id).slice(0,80).join("|"):normalIds;
  useEffect(()=>{onVisible(scope,ids?ids.split("|"):[]);return()=>onVisible(scope,[]);},[ids,onVisible,scope]);
  return <div ref={element} className="message-timeline" data-loaded-count={messages.length} data-virtualized={enabled ? "true" : "false"} style={enabled?{height:virtual.getTotalSize(),position:"relative"}:undefined}>
    {enabled?items.map(item=><div key={item.key} data-index={item.index} ref={virtual.measureElement} style={{position:"absolute",top:0,left:0,width:"100%",transform:`translateY(${item.start-margin}px)`}}>{renderMessage(messages[item.index],item.index)}</div>):messages.map((message,index)=><div key={message.id} data-index={index} ref={virtual.measureElement}>{renderMessage(message,index)}</div>)}
  </div>;
}
