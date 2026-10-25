"use client";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { getThreadPage } from "../../lib/chat/threads";
import type { ChatMessage, PendingMessage, DeliveryChange } from "../../lib/chat/types";
import { MessageItem } from "./MessageItem";
import { MessageTimeline } from "./MessageTimeline";
import { PendingMessageRow } from "./PendingMessageRow";
import { MessageComposer } from "./MessageComposer";
import { groupWithPrevious, messageDay, messageDateLabel } from "../../lib/chat/presentation";
const noVisible = () => {};
export function ThreadPanel({ channelId, channelName, parentId, targetId, active, messages, userId, canPost, canAttach, connection, moderator, localTime, locked, highlight, onClose, onReply, onMerge, onDenied, onTyping, onLocked, pending = [], onDelivery, watchVisible = noVisible }: {
  channelId: string; channelName: string; parentId: string; targetId: string; active: boolean;
  pending?: PendingMessage[]; onDelivery?: (change:DeliveryChange)=>void; watchVisible?: (scope:string,ids:string[])=>void;
  messages: ChatMessage[]; userId: string; canPost: boolean; canAttach?: boolean; connection: string; moderator: boolean; localTime: boolean; locked: boolean; highlight: string;
  onClose: () => void; onReply: (message: ChatMessage) => void; onMerge: (messages: ChatMessage[]) => void; onDenied: () => void; onTyping: (active: boolean) => void; onLocked: (locked: boolean) => void;
}) {
  const [floor, setFloor] = useState<string | null>(null), [before, setBefore] = useState<string | null>(null), [more, setMore] = useState(false);
  const [newMessages,setNewMessages]=useState(0),arrival=useRef("0");
  const [loading, setLoading] = useState(true), [error, setError] = useState(""), [retry, setRetry] = useState(0);
  const list = useRef<HTMLDivElement>(null), heading = useRef<HTMLHeadingElement>(null);
  const nearBottom = useRef(true), generation = useRef(0), loaded = useRef(false);
  const anchor = useRef<{ top: number; height: number } | null>(null);
  const mergeRef = useRef(onMerge), deniedRef = useRef(onDenied);
  mergeRef.current = onMerge; deniedRef.current = onDenied;
  const focusedReply = useRef("");
  const savedScroll=useRef(0),restoreScroll=useRef(false);
  useEffect(()=>{watchVisible("thread-root",active?[parentId]:[]);return()=>watchVisible("thread-root",[]);},[watchVisible,active,parentId]);
  const root = messages.find((message) => message.id === parentId && message.channel_id === channelId && message.parent_id === null);
  const replies = useMemo(()=>!active || floor === null ? [] : messages.filter((message) => message.channel_id === channelId && message.parent_id === parentId && (BigInt(message.created_seq) >= BigInt(floor) || message.id === highlight)),[active,floor,messages,channelId,parentId,highlight]);
  useEffect(() => {
    if (!active) return;
    const request = ++generation.current;
    restoreScroll.current=loaded.current;
    setLoading(true); setError("");
    heading.current?.focus({ preventScroll: true });
    void getThreadPage({ channelId, parentId }).then((result) => {
      if (request !== generation.current) return;
      if (result.denied) { deniedRef.current(); return; }
      if (!result.data) { setError(result.error ?? "Thread unavailable."); return; }
      mergeRef.current([result.data.root, ...result.data.messages]);
      if (!loaded.current) {
        arrival.current=result.data.messages.at(-1)?.created_seq??"0";
        const first = result.data.messages[0]?.created_seq ?? "0";
        setFloor(first); setBefore(result.data.messages[0]?.created_seq ?? null);
        setMore(result.data.messages.length === 40); loaded.current = true;
      }
    }).catch(() => { if(request === generation.current) setError("Thread unavailable. Check your connection and retry."); })
      .finally(() => { if(request === generation.current) setLoading(false); });
    // Monotonic request generation, not a DOM-node ref. Invalidate every pending page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return () => { generation.current++; };
  }, [channelId, parentId, active, retry]);
  useLayoutEffect(() => {
    const element = list.current;
    if (!element || !active) return;
    if (anchor.current) { element.scrollTop = anchor.current.top + element.scrollHeight - anchor.current.height; anchor.current = null; }
    else if(restoreScroll.current&&!loading&&!nearBottom.current){element.scrollTop=savedScroll.current;restoreScroll.current=false;}
    else if (nearBottom.current && !loading) element.scrollTop = element.scrollHeight;
  }, [replies.length, pending.length, floor, active, loading]);
  useEffect(()=>{if(!active||loading)return;const newer=replies.filter(message=>BigInt(message.created_seq)>BigInt(arrival.current));if(newer.length){arrival.current=newer.at(-1)!.created_seq;if(!nearBottom.current)setNewMessages(value=>value+newer.length);}
    // Older pages and edits do not count as arrivals.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[messages,active,loading]);
  useEffect(() => {
    if (!active || loading || floor === null || highlight === parentId || focusedReply.current === highlight) return;
    const container = list.current;
    const target = container?.querySelector<HTMLElement>(`[data-thread-message-id="${highlight}"]`);
    if (container && target) {
      container.scrollTop += target.getBoundingClientRect().top - container.getBoundingClientRect().top - container.clientHeight / 2 + target.clientHeight / 2;
      nearBottom.current = false; focusedReply.current = highlight;
    }
  }, [active, loading, floor, highlight, parentId]);
  async function older() {
    if (loading || !more || !active) return;
    const request = ++generation.current;
    setLoading(true); setError(""); nearBottom.current = false;
    try {
      const result = await getThreadPage({ channelId, parentId, before });
      if(request !== generation.current) return;
      if(result.denied) { onDenied(); return; }
      if(!result.data) { setError(result.error ?? "Older replies unavailable."); return; }
      if(list.current && replies.length+result.data.messages.length<=120) anchor.current = { top: list.current.scrollTop, height: list.current.scrollHeight };
      onMerge([result.data.root, ...result.data.messages]);
      const first = result.data.messages[0]?.created_seq;
      if(first) { setFloor(first); setBefore(first); }
      setMore(result.data.messages.length === 40);
    } catch { if(request === generation.current) setError("Older replies unavailable. Please retry."); }
    finally { if(request === generation.current) setLoading(false); }
  }
  return <section className="chat-thread-panel" hidden={!active} aria-label="Message thread">
    <header className="thread-panel-header"><div><h2 ref={heading} tabIndex={-1}>Thread</h2><p>In #{channelName}</p></div><button type="button" className="chat-text-button" disabled={locked} onClick={onClose} title="Close thread">Back to channel</button></header>
    {root?.deleted_at && <p className="thread-closed" role="status">Original message deleted. Existing replies remain available; new replies are closed.</p>}
    <div ref={list} className="chat-message-list thread-message-list" aria-label="Thread messages" tabIndex={0} onScroll={(event) => { const element = event.currentTarget;if(!active||!element.clientHeight)return;savedScroll.current=element.scrollTop; nearBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < 100;if(nearBottom.current)setNewMessages(0); }}>
      {active && root && <div className="thread-original" aria-label="Original message"><MessageItem message={root} scope="thread" userId={userId} canPost={canPost} moderator={moderator} replyDisabled={locked} localTime={localTime} onMerge={onMerge} onReply={onReply} /></div>}
      <h3 className="thread-reply-count">{root?.reply_count ?? 0} replies</h3>
      {floor !== null && replies.some((message) => message.id === highlight && BigInt(message.created_seq) < BigInt(floor)) && <p className="thread-status">Linked reply shown. Load older replies for the full context.</p>}
      {more && <button type="button" className="button secondary" disabled={loading} onClick={() => void older()}>Load older replies</button>}
      {!loading && !error && !replies.length && <p className="chat-empty">Start a focused conversation about this message.</p>}
      {active&&<MessageTimeline messages={replies} targetId={highlight} scrollRef={list} scope="thread" onVisible={watchVisible} renderMessage={(message,index)=><div>
        {(index === 0 || messageDay(message.created_at, localTime) !== messageDay(replies[index - 1].created_at, localTime)) && <div className="chat-day-divider" role="separator" aria-label={messageDateLabel(message.created_at, localTime)}><span>{messageDateLabel(message.created_at, localTime)}</span></div>}
        <MessageItem message={message} scope="thread" userId={userId} canPost={canPost} moderator={moderator} replyDisabled={locked} localTime={localTime} grouped={groupWithPrevious(message, replies[index - 1], localTime)} highlight={highlight === message.id} onMerge={onMerge} onReply={onReply} />
      </div>}/> }
      {active&&pending.filter(message=>message.parentId===parentId&&!messages.some(saved=>saved.id===message.id)).map(message=><PendingMessageRow key={message.id} message={message}/>)}
    </div>
    {!!newMessages&&<button type="button" className="chat-new-messages" onClick={()=>{if(list.current)list.current.scrollTop=list.current.scrollHeight;nearBottom.current=true;setNewMessages(0);}}>{newMessages} New Messages · Jump to latest reply</button>}
    {loading && <p className="thread-status" role="status">Loading replies…</p>}
    {error && <p className="thread-status form-error" role="alert">{error} <button type="button" className="chat-text-button" onClick={() => setRetry((value) => value + 1)}>Retry thread</button></p>}
    <MessageComposer channelId={channelId} channelName={channelName} userId={userId} canPost={canPost && !!root && !root.deleted_at && floor !== null} canAttach={canAttach} connection={connection} parentId={parentId} reply={messages.find((message) => message.id === targetId) ?? root} hidden={!active} committed={messages} onDelivery={onDelivery} onCancelReply={onClose} onSent={(message) => { onMerge([message]); }} onTyping={onTyping} onLocked={onLocked} />
  </section>;
}
