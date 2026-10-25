"use client";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  getHistory,
  getMessage,
  markRead,
} from "../../lib/chat/actions";
import type { ChatMessage, ChatPage } from "../../lib/chat/types";
import { useChannelChat } from "./useChannelChat";
import { MessageComposer } from "./MessageComposer";
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
  const [older, setOlder] = useState(initial.messages.length === 40);
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
  const roots = allMessages.filter((m) => m.parent_id === null);
  function captureAnchor() {
    const list = channelList.current;
    if (!list || !list.clientHeight) return;
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
    if (!sharedMessage) return;
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
      .catch(() => setError("That message could not be loaded."));
    return () => {
      active = false;
    };
    // A shared link is loaded once per channel/message, not for every live update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sharedMessage, channelId]);
  useEffect(() => {
    if (chat.denied) {
      setThread(null);
      setThreadOpen(false);
      setThreadLocked(false);
      setSearchResults(null);
    }
  }, [chat.denied]);
  useEffect(() => {
    if (compact && threadOpen) return;
    if (wasNearBottom.current && !sharedMessage && !searchResults)
      bottom.current?.scrollIntoView({ block: "nearest" });
    const visible = roots;
    const latest = visible.at(-1);
    if (
      !latest ||
      !document.hasFocus() ||
      document.visibilityState !== "visible" ||
      !wasNearBottom.current ||
      searchResults ||
      BigInt(latest.created_seq) <= BigInt(seen.current)
    )
      return;
    const timer = setTimeout(() => {
      void markRead(channelId, latest.id)
        .then((result) => {
          if (result.data) {
            seen.current = latest.created_seq;
            return chat.refresh();
          }
        })
        .catch(() => {});
    }, 600);
    return () => clearTimeout(timer);
    // Message versions change after read notifications; created_seq prevents receipt loops.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allMessages, threadOpen, compact, searchResults, channelId]);
  async function olderMessages() {
    if (loading) return;
    wasNearBottom.current = false; setLoading(true); setError("");
    try {
      const result = await getHistory({ channelId, before: rootBefore });
      if(result.data) {
        const element = channelList.current;
        const height = element?.scrollHeight ?? 0, top = element?.scrollTop ?? 0;
        merge(result.data.messages); setOlder(result.data.messages.length === 40); setRootBefore(result.data.messages[0]?.created_seq ?? null);
        requestAnimationFrame(() => { if(element) element.scrollTop = top + element.scrollHeight - height; });
      } else setError(result.error ?? "History unavailable.");
    } catch { setError("History unavailable. Please retry."); }
    finally { setLoading(false); }
  }
  async function runSearch(more = false) {
    if (search.trim().length < 2) {
      setError("Enter at least two characters.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const result = await getHistory({
        channelId,
        search: search.trim(),
        before: more ? searchBefore : null,
      });
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
      setError("Search unavailable.");
    } finally {
      setLoading(false);
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
        <button
          className="chat-text-button"
          onClick={() => {
            const latest = allMessages.at(-1);
            if (latest)
              void markRead(channelId, latest.id)
                .then((result) => {
                  if (result.error) {
                    setError(result.error);
                    return;
                  }
                  return chat.refresh();
                })
                .catch(() =>
                  setError("Read status could not be updated. Please retry."),
                );
          }}
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
              wasNearBottom.current =
                el.scrollHeight - el.scrollTop - el.clientHeight < 120;
            }}
          >
            {!searchResults && older && (
              <button
                className="button secondary"
                disabled={loading}
                onClick={() => void olderMessages()}
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
            {visible.map((m, index) => (
              <div key={m.id}>
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
                  onMerge={(messages) => { merge(messages); void chat.refresh().catch(() => {}); }}
                  onReply={(m) => {
                    setHighlight(m.id);
                    void openThread(m);
                  }}
                  highlight={highlight === m.id}
                />
              </div>
            ))}
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
          <div className="chat-typing" role="status">
            {chat.typing.length
              ? `${chat.typing.slice(0, 3).join(", ")} ${chat.typing.length === 1 ? "is" : "are"} typing…`
              : ""}
          </div>
          <MessageComposer
            channelId={channelId} channelName={channelName} userId={userId}
            canPost={chat.canPost} connection={chat.status} hidden={!!searchResults || (compact && threadOpen)}
            parentId={null}
            onCancelReply={() => {}} onLocked={setComposerLocked}
            onTyping={chat.indicateTyping}
            onSent={(message) => { merge([message]); wasNearBottom.current = true; void chat.refresh().catch(() => {}); }}
          />
        </section>
        {thread && <ThreadPanel key={thread} channelId={channelId} channelName={channelName} parentId={thread} targetId={replyTo ?? thread} active={threadOpen} messages={allMessages} userId={userId} canPost={chat.canPost} connection={chat.status} moderator={moderator} localTime={localTime} locked={threadLocked} highlight={highlight} onClose={closeThread} onReply={openThread} onMerge={(messages) => { merge(messages); void chat.refresh().catch(() => {}); }} onDenied={chat.lock} onTyping={chat.indicateTyping} onLocked={setThreadLocked} />}
        </div>
      )}
      {loading && (
        <p role="status" className="padded">
          Loading messages…
        </p>
      )}
      {error && (
        <p role="alert" className="form-error padded">
          {error}
        </p>
      )}
    </section>
  );
}
