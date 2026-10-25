"use client";
import { firstUnread } from "../../lib/chat/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  getHistory,
  getMessage,
  markRead,
} from "../../lib/chat/actions";
import type { ChatMessage, ChatPage } from "../../lib/chat/types";
import { useChannelChat } from "./useChannelChat";
import { MessageComposer } from "./MessageComposer";
import { getConversationPage, markAllRead } from "../../lib/chat/reliability";
import { nearEnd, visibleAnchor, restoreAnchor } from "../../lib/chat/scrolling";
import { MessageTimeline } from "./MessageTimeline";
import { PendingMessageRow } from "./PendingMessageRow";
import { ThreadPanel } from "./ThreadPanel";
import { PinnedMessages } from "./PinnedMessages";
import { MessageItem } from "./MessageItem";
import { groupWithPrevious, messageDay, messageDateLabel } from "../../lib/chat/presentation";
import { reconcileMessages } from "../../lib/chat/reconcile";
export function ChatWorkspace({
  channelId,
  channelName,
  userId,
  initial,
  url,
  publishableKey,
  sharedMessage,
}: {
  channelId: string;
  channelName: string;
  userId: string;
  initial: ChatPage;
  url: string;
  publishableKey: string;
  sharedMessage?: string;
}) {
  const [jumping,setJumping]=useState(false);
  const chat = useChannelChat({
    channelId,
    userId,
    initial,
    url,
    publishableKey,
  });
  const { messages: allMessages, merge } = chat;
  const [localTime, setLocalTime] = useState(false);
  useEffect(() => setLocalTime(true), []);
  const [error, setError] = useState("");
  const [composerLocked, setComposerLocked] = useState(false);
  const [threadLocked, setThreadLocked] = useState(false);
  const [threadOpen, setThreadOpen] = useState(false);
  const [compact, setCompact] = useState(false);
  const channelList = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const scrollAnchor = useRef<{ id: string; offset: number } | null>(null);
  const pendingAnchor = useRef(false);
  useEffect(() => { const media = matchMedia("(max-width: 1000px)"); const update = () => setCompact(media.matches); update(); media.addEventListener("change", update); return () => media.removeEventListener("change", update); }, []);
  const [thread, setThread] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [older, setOlder] = useState(initial.has_older ?? initial.messages.length === 40);
  const [hasNewer,setHasNewer]=useState(initial.has_newer??false);
  const [floor,setFloor]=useState(initial.messages[0]?.created_seq??"0");
  const [ceiling,setCeiling]=useState(initial.messages.at(-1)?.created_seq??"0");
  const [viewportVersion,setViewportVersion]=useState(0),[following,setFollowing]=useState(false);
  const followedShape=useRef("");
  const positioned=useRef(false),arrival=useRef(initial.latest_seq??initial.messages.at(-1)?.created_seq??"0");
  const pageRequest=useRef(0);
  const [newMessages,setNewMessages]=useState(0);

  const [rootBefore, setRootBefore] = useState(
    initial.messages[0]?.created_seq ?? null,
  );
  const [loading, setLoading] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<ChatMessage[] | null>(
    null,
  );
  const [searchBefore, setSearchBefore] = useState<string | null>(null);
  const [searchMore, setSearchMore] = useState(false);
  const [highlight, setHighlight] = useState(sharedMessage ?? "");
  const bottom = useRef<HTMLDivElement>(null);
  const wasNearBottom = useRef(true);
  const seen = useRef("0");
  const allRoots = useMemo(()=>allMessages.filter((m) => m.parent_id === null),[allMessages]);
  const roots = useMemo(()=>allRoots.filter(message=>message.id===sharedMessage||(BigInt(message.created_seq)>=BigInt(floor)&&(!hasNewer||BigInt(message.created_seq)<=BigInt(ceiling)))),[allRoots,sharedMessage,floor,hasNewer,ceiling]);
  const pending = chat.pending.filter(message=>message.parentId===null&&!allMessages.some(saved=>saved.id===message.id));
  useEffect(()=>{if(!chat.recoveryPage)return;const page=chat.recoveryPage;setFloor(page.messages[0]?.created_seq??"0");setCeiling(page.messages.at(-1)?.created_seq??"0");setOlder(page.has_older??false);setHasNewer(page.has_newer??false);setRootBefore(page.messages[0]?.created_seq??null);positioned.current=false;},[chat.recoveryPage]);

  function captureAnchor() {
    const list = channelList.current;
    if (!list || !list.clientHeight) return;
    wasNearBottom.current=nearEnd(list);
    const top = list.getBoundingClientRect().top;
    const message = Array.from(list.querySelectorAll<HTMLElement>(".chat-message")).find((item) => item.getBoundingClientRect().bottom > top);
    if (message) scrollAnchor.current = { id: message.id, offset: message.getBoundingClientRect().top - top };
  }
  useLayoutEffect(() => {
    if (!pendingAnchor.current || !channelList.current?.clientHeight) return;
    const anchor = scrollAnchor.current;
    const element = anchor && document.getElementById(anchor.id);
    if (element && anchor) channelList.current.scrollTop += element.getBoundingClientRect().top - channelList.current.getBoundingClientRect().top - anchor.offset;
    pendingAnchor.current = false;
  }, [threadOpen, compact]);
  const openThread = useCallback((message: ChatMessage) => {
    if (message.channel_id !== channelId) return;
    if (composerLocked || threadLocked) { setError("Confirm the pending message before switching threads."); return; }
    if (!threadOpen) {
      captureAnchor(); pendingAnchor.current = true;
      returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    }
    setThread(message.parent_id ?? message.id); setReplyTo(message.id); setThreadOpen(true); setHighlight(message.id);
    setSearchResults(null);
  }, [channelId, composerLocked, threadLocked, threadOpen]);
  function closeThread() {
    if (threadLocked) return;
    captureAnchor(); pendingAnchor.current = true; setThreadOpen(false);
    requestAnimationFrame(() => returnFocus.current?.isConnected && returnFocus.current.focus({ preventScroll: true }));
  }
  useEffect(() => {
    if (!sharedMessage || chat.denied) return;
    let active = true;
    void getMessage(sharedMessage)
      .then((result) => {
        if (!active) return;
        if (result.data?.channel_id === channelId) {
          setHighlight(sharedMessage);
          merge([result.data]);
          if (result.data.parent_id) openThread(result.data);
          else if (compact && threadOpen) closeThread();
          setTimeout(
            () =>
              document
                .getElementById(`${result.data?.parent_id ? "thread-message" : "message"}-${sharedMessage}`)
                ?.scrollIntoView({ block: "center" }),
            150,
          );
        } else setError("That message is unavailable.");
      })
      .catch(() => { if(active) setError("That message could not be loaded."); });
    return () => {
      active = false;
    };
    // A shared link is loaded once per channel/message, not for every live update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sharedMessage, channelId, chat.denied]);
  useEffect(() => {
    if (chat.denied) {
      pageRequest.current++;
      setJumping(false);setLoading(false);
      setThread(null);
      setThreadOpen(false);
      setThreadLocked(false);
      setSearchResults(null);
    }
  }, [chat.denied]);
  useLayoutEffect(() => {
    const list=channelList.current;
    if(!list||!list.clientHeight||searchResults||(compact&&threadOpen))return;
    const shape=`${roots.length}:${pending.length}`;const appended=followedShape.current!==shape;followedShape.current=shape;
    if(!positioned.current){
      positioned.current=true;
      const id=initial.first_unread_id??roots.find(message=>message.author_id!==userId&&!message.deleted_at&&BigInt(message.created_seq)>BigInt(initial.last_read_seq))?.id;
      const target=id&&document.getElementById(`message-${id}`);
      if(target&&!sharedMessage){list.scrollTop+=target.getBoundingClientRect().top-list.getBoundingClientRect().top;wasNearBottom.current=nearEnd(list);}
      else if(!sharedMessage&&!hasNewer){list.scrollTop=list.scrollHeight;wasNearBottom.current=true;}
      setFollowing(wasNearBottom.current&&!hasNewer);setViewportVersion(value=>value+1);
    }else if(appended&&wasNearBottom.current&&!hasNewer&&!sharedMessage){list.scrollTop=list.scrollHeight;}
    // Follow only on list shape changes; edits/reactions must not move a reader.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[roots.length,pending.length,searchResults,compact,threadOpen,hasNewer,sharedMessage,initial.first_unread_id,initial.last_read_seq,userId]);
  useEffect(()=>{
    const next=allRoots.filter(message=>BigInt(message.created_seq)>BigInt(arrival.current));
    if(!next.length)return;
    arrival.current=next.at(-1)!.created_seq;
    if(!wasNearBottom.current||hasNewer)setNewMessages(value=>value+next.length);
    // A message version/reaction does not count as a new arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[allMessages]);
  useEffect(()=>{
    const list=channelList.current;if(!list)return;
    const changed=()=>setViewportVersion(value=>value+1);
    const content=list.querySelector(".message-timeline");
    const resize=typeof ResizeObserver!=="undefined"?new ResizeObserver(()=>{if(positioned.current&&wasNearBottom.current&&!hasNewer&&!searchResults&&!(compact&&threadOpen)&&!sharedMessage)list.scrollTop=list.scrollHeight;changed();}):null;
    if(content)resize?.observe(content);resize?.observe(list);
    window.addEventListener("focus",changed);document.addEventListener("visibilitychange",changed);
    return()=>{resize?.disconnect();window.removeEventListener("focus",changed);document.removeEventListener("visibilitychange",changed);};
  },[hasNewer,searchResults,compact,threadOpen,sharedMessage]);
  useEffect(()=>{
    if((compact&&threadOpen)||searchResults||!positioned.current||!wasNearBottom.current||!document.hasFocus()||document.visibilityState!=="visible")return;
    const latest=roots.at(-1);const list=channelList.current;const row=latest&&document.getElementById(`message-${latest.id}`);
    if(!latest||!list||!row||BigInt(latest.created_seq)<=BigInt(chat.lastRead)||BigInt(latest.created_seq)<=BigInt(seen.current)||row.getBoundingClientRect().bottom>list.getBoundingClientRect().bottom+4)return;
    const timer=setTimeout(()=>{if(!document.hasFocus()||document.visibilityState!=="visible"||!wasNearBottom.current)return;void markRead(channelId,latest.id).then(result=>{if(result.data){seen.current=latest.created_seq;return chat.refresh();}}).catch(()=>{});},600);
    return()=>clearTimeout(timer);
    // Roots and DOM visibility, never pending sends/hidden thread views, advance the receipt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[allMessages,chat.lastRead,viewportVersion,compact,threadOpen,searchResults,channelId]);
  async function pageHistory(mode:"before"|"after"|"latest") {
    if(loading)return;const request=++pageRequest.current;
    const list=channelList.current,anchor=list?visibleAnchor(list):null;
    const previousCount=roots.length;
    wasNearBottom.current=mode==="latest";setFollowing(mode==="latest");setLoading(true);setError("");
    try{
      const result=await getConversationPage({channelId,mode,cursor:mode==="before"?rootBefore:mode==="after"?ceiling:null});
      if(request!==pageRequest.current)return;
      if(result.denied){chat.lock();return;}if(!result.data){setError(result.error??"History unavailable.");return;}
      const page=result.data;merge(page.messages);
      if(mode!=="after"){setFloor(page.messages[0]?.created_seq??floor);setRootBefore(page.messages[0]?.created_seq??rootBefore);setOlder(page.has_older??false);}
      if(mode!=="before"){setCeiling(page.messages.at(-1)?.created_seq??ceiling);setHasNewer(page.has_newer??false);}
      requestAnimationFrame(()=>{if(!list)return;if(mode==="latest"){list.scrollTop=list.scrollHeight;setNewMessages(0);}else if(previousCount+page.messages.length<=120)restoreAnchor(list,anchor);setViewportVersion(value=>value+1);});
    }catch{if(request===pageRequest.current)setError("History unavailable. Please retry.");}
    finally{if(request===pageRequest.current)setLoading(false);}
  }
  useEffect(()=>()=>{pageRequest.current++;},[]);
  async function jumpUnread(){
    if(jumping)return;const request=++pageRequest.current;setJumping(true);setError("");
    try{const result=await firstUnread(channelId);if(request!==pageRequest.current)return;
      if(result.denied){chat.lock();return;}if(result.error){setError(result.error);return;}if(!result.data){setError("You’re up to date.");return;}
      if(result.data.parent_id){merge([result.data]);openThread(result.data);return;}
      const resultPage=await getConversationPage({channelId,mode:"initial"});if(request!==pageRequest.current)return;
      if(resultPage.denied){chat.lock();return;}if(!resultPage.data){setError(resultPage.error??"Unread history unavailable.");return;}
      const page=resultPage.data;merge(page.messages);chat.applyState(page);setSearchResults(null);setFloor(page.messages[0]?.created_seq??"0");setCeiling(page.messages.at(-1)?.created_seq??"0");setRootBefore(page.messages[0]?.created_seq??null);setOlder(page.has_older??false);setHasNewer(page.has_newer??false);wasNearBottom.current=false;setFollowing(false);
      const target=page.first_unread_id??page.messages.at(-1)?.id;if(target){setHighlight(target);requestAnimationFrame(()=>{const list=channelList.current,row=document.getElementById(`message-${target}`);if(list&&row)list.scrollTop+=row.getBoundingClientRect().top-list.getBoundingClientRect().top;setViewportVersion(value=>value+1);});}
    }catch{if(request===pageRequest.current)setError("Unread messages could not be loaded.");}finally{if(request===pageRequest.current)setJumping(false);}
  }
  async function runSearch(more = false) {
    if (search.trim().length < 2) {
      setError("Enter at least two characters.");
      return;
    }
    const request=++pageRequest.current;
    setLoading(true);
    setError("");
    try {
      const result = await getHistory({
        channelId,
        search: search.trim(),
        before: more ? searchBefore : null,
      });
      if(request!==pageRequest.current)return;
      if (result.denied){chat.lock();return;}
      if (result.data) {
        setSearchResults((previous) =>
          more
            ? reconcileMessages(previous ?? [], result.data!.messages)
            : result.data!.messages,
        );
        setSearchBefore(result.data.messages[0]?.created_seq ?? null);
        setSearchMore(result.data.messages.length === 40);
      } else setError(result.error ?? "Search unavailable.");
    } catch {
      if(request===pageRequest.current)setError("Search unavailable.");
    } finally {
      if(request===pageRequest.current)setLoading(false);
    }
  }
  const visible =
    searchResults?.map(
      (m) => allMessages.find((item) => item.id === m.id) ?? m,
    ) ?? roots;
  const firstUnreadId = visible.find(
    (m) =>
      m.author_id !== userId &&
      !m.deleted_at &&
      BigInt(m.created_seq) > BigInt(chat.lastRead),
  )?.id;
  const moderator = ["owner", "administrator", "moderator"].includes(chat.role);
  return (
    <section
      className={`chat-workspace panel ${threadOpen ? "has-thread" : ""}`}
      aria-label={`${channelName} messages`}
    >
      <div className="chat-toolbar">
        <span
          role="status"
          className={`chat-connection ${chat.status === "Live" ? "live" : ""}`}
        >
          {chat.status === "Live" ? "● Live" : chat.status}
        </span>
        <span>{chat.unread} unread</span>
        {!chat.denied && <PinnedMessages channel={channelId} revision={chat.refreshVersion} moderator={moderator} onMerge={(messages) => { merge(messages); void chat.refresh().catch(() => {}); }} />}
        <button className="chat-text-button" aria-expanded={searchOpen} disabled={composerLocked || threadLocked} onClick={() => { if (compact && threadOpen) closeThread(); setSearchOpen(!searchOpen); if (searchOpen) setSearchResults(null); }}>Search channel</button>
        {chat.status !== "Live" && (
          <button className="chat-text-button" onClick={chat.retryConnection}>
            Reconnect
          </button>
        )}
        <button type="button" className="chat-text-button" disabled={jumping||composerLocked||threadLocked||chat.denied||!chat.unread} onClick={()=>void jumpUnread()}>Jump to first unread</button>
        <button
          className="chat-text-button"
          onClick={() => { void markAllRead(channelId).then(result=>{if(result.data)chat.applyState(result.data);else setError(result.error??"Read state unavailable.");}).catch(()=>setError("Read state unavailable. Please retry.")); }}
        >
          Mark read
        </button>
      </div>
      {chat.denied ? (
        <div className="padded">
          <h2>Channel access is unavailable</h2>
          <p>
            Your permissions may have changed. Return to your community or sign
            in again.
          </p>
        </div>
      ) : (
        <div className="chat-panes">
        <section className="chat-main-pane" aria-label="Channel conversation" hidden={compact && threadOpen}>
          {searchOpen && <form
            className="chat-search"
            onSubmit={(e) => {
              e.preventDefault();
              void runSearch();
            }}
          >
            <label>
              <span className="sr-only">Search this channel</span>
              <input
                value={search}
                disabled={composerLocked || threadLocked}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search this channel…"
                minLength={2}
                maxLength={100}
              />
            </label>
            <button
              type="submit"
              className="button secondary"
              disabled={loading || composerLocked || threadLocked}
            >
              Search
            </button>
            {searchResults && (
              <button
                type="button"
                className="chat-text-button"
                onClick={() => setSearchResults(null)}
              >
                Close search
              </button>
            )}
          </form>}
          {searchResults && (
            <h2 className="chat-result-title">Search results</h2>
          )}
          <div
            ref={channelList}
            className="chat-message-list"
            aria-label={
              searchResults
                ? "Search results"
                : "Channel messages"
            }
            tabIndex={0}
            onScroll={(e) => {
              const el = e.currentTarget;
              if(!el.clientHeight||(compact&&threadOpen))return;
              wasNearBottom.current = nearEnd(el);
              setFollowing(wasNearBottom.current&&!hasNewer);
              if(wasNearBottom.current&&!hasNewer)setNewMessages(0);
              setViewportVersion(value=>value+1);
            }}
          >
            {!searchResults && older && (
              <button
                className="button secondary"
                disabled={loading}
                onClick={() => void pageHistory("before")}
              >
                Load older messages
              </button>
            )}
            {!visible.length && (
              <div className="chat-empty">
                <h2>
                  {searchResults
                    ? "No messages found"
                    : "Start the conversation"}
                </h2>
                <p>
                  {searchResults
                    ? "Try a different search."
                    : "Your message will be saved before it is delivered live."}
                </p>
              </div>
            )}
            <MessageTimeline messages={visible} targetId={highlight} scrollRef={channelList} scope="channel" onVisible={chat.watchVisible} renderMessage={(m,index)=>(
              <div>
                {(index === 0 || messageDay(m.created_at, localTime) !== messageDay(visible[index-1].created_at, localTime)) && <div className="chat-day-divider" role="separator" aria-label={messageDateLabel(m.created_at, localTime)}><span>{messageDateLabel(m.created_at, localTime)}</span></div>}
                {!searchResults &&
                  m.id === firstUnreadId && (
                    <div className="chat-unread-divider">Unread messages</div>
                  )}
                <MessageItem
                  message={m}
                  grouped={!searchResults && m.id !== firstUnreadId && groupWithPrevious(m, visible[index-1], localTime)}
                  localTime={localTime}
                  userId={userId}
                  canPost={chat.canPost}
                  replyDisabled={composerLocked || threadLocked}
                  moderator={moderator}
                  onMerge={merge}
                  onReply={openThread}
                  highlight={highlight === m.id}
                />
              </div>
            )} />
            {!searchResults&&hasNewer&&<button type="button" className="button secondary" disabled={loading} onClick={()=>void pageHistory("after")}>Load newer messages</button>}
            {!searchResults&&pending.map(message=><PendingMessageRow key={message.id} message={message}/>)}
            {searchResults && searchMore && (
              <button
                className="button secondary"
                disabled={loading}
                onClick={() => void runSearch(true)}
              >
                More search results
              </button>
            )}
            <div ref={bottom} />
          </div>
          {!searchResults&&(!following||hasNewer)&&<button type="button" className="new-messages-button" disabled={loading} onClick={()=>void pageHistory("latest")}>New Messages{newMessages?` · ${newMessages}`:""} · Jump to latest</button>}
          <div className="chat-typing" role="status">
            {chat.typing.length
              ? `${chat.typing.slice(0, 3).join(", ")} ${chat.typing.length === 1 ? "is" : "are"} typing…`
              : ""}
          </div>
          <MessageComposer
            channelId={channelId} channelName={channelName} userId={userId}
            canPost={chat.canPost} connection={chat.status} hidden={!!searchResults || (compact && threadOpen)}
            parentId={null} committed={allMessages} onDelivery={chat.delivery}
            onCancelReply={() => {}} onLocked={setComposerLocked}
            onTyping={chat.indicateTyping}
            onSent={(message) => { merge([message]); void chat.refresh().catch(() => {}); }}
          />
        </section>
        {thread && <ThreadPanel key={thread} channelId={channelId} channelName={channelName} parentId={thread} targetId={replyTo ?? thread} active={threadOpen} messages={allMessages} pending={chat.pending} onDelivery={chat.delivery} watchVisible={chat.watchVisible} userId={userId} canPost={chat.canPost} connection={chat.status} moderator={moderator} localTime={localTime} locked={threadLocked} highlight={highlight} onClose={closeThread} onReply={openThread} onMerge={merge} onDenied={chat.lock} onTyping={chat.indicateTyping} onLocked={setThreadLocked} />}
        </div>
      )}
      {loading && (
        <p role="status" className="padded">
          Loading messages…
        </p>
      )}
      {chat.syncError&&<p role="status" className="chat-sync-error">{chat.syncError}</p>}
      {error && (
        <p role="alert" className="form-error padded">
          {error}
        </p>
      )}
    </section>
  );
}
