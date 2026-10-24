"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  getHistory,
  getMessage,
  markRead,
} from "../../lib/chat/actions";
import type { ChatMessage, ChatPage } from "../../lib/chat/types";
import { useChannelChat } from "./useChannelChat";
import { MessageComposer } from "./MessageComposer";
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
  const threadGeneration = useRef(0);
  const [thread, setThread] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [older, setOlder] = useState(initial.messages.length === 40);
  const [rootBefore, setRootBefore] = useState(
    initial.messages[0]?.created_seq ?? null,
  );
  const [threadBefore, setThreadBefore] = useState<string | null>(null);
  const [threadOlder, setThreadOlder] = useState(false);
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
  const replies = allMessages.filter((m) => m.parent_id === thread);
  const root = allMessages.find((m) => m.id === thread);
  const openThread = useCallback(
    async (m: ChatMessage) => {
      const generation = ++threadGeneration.current;
      const parent = m.parent_id ?? m.id;
      setThread(parent);
      setReplyTo(m.id);
      setSearchResults(null);
      setLoading(true);
      setError("");
      try {
        if (m.parent_id && !allMessages.some((item) => item.id === parent)) {
          const parentResult = await getMessage(parent);
          if (parentResult.data?.channel_id === channelId)
            merge([parentResult.data]);
        }
        const result = await getHistory({ channelId, parentId: parent });
        if (generation !== threadGeneration.current) return;
        if (result.data) {
          merge(result.data.messages);
          setThreadOlder(result.data.messages.length === 40);
          setThreadBefore(result.data.messages[0]?.created_seq ?? null);
        } else setError(result.error ?? "Thread unavailable.");
      } catch {
        if (generation === threadGeneration.current) setError("Thread unavailable. Please retry.");
      } finally {
        if (generation === threadGeneration.current) setLoading(false);
      }
    },
    [channelId, merge, allMessages],
  );
  useEffect(() => {
    if (!sharedMessage) return;
    let active = true;
    void getMessage(sharedMessage)
      .then((result) => {
        if (!active) return;
        if (result.data?.channel_id === channelId) {
          merge([result.data]);
          if (result.data.parent_id) void openThread(result.data);
          setTimeout(
            () =>
              document
                .getElementById(`message-${sharedMessage}`)
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
      threadGeneration.current++;
      setThread(null);
      setSearchResults(null);
    }
  }, [chat.denied]);
  useEffect(() => {
    if (wasNearBottom.current && !sharedMessage && !searchResults)
      bottom.current?.scrollIntoView({ block: "nearest" });
    const visible = thread ? replies : roots;
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
  }, [allMessages, thread, searchResults, channelId]);
  function closeThread() {
    threadGeneration.current++;
    setThread(null);
    setReplyTo(null);
    setLoading(false);
  }
  async function olderMessages(inThread: boolean) {
    const generation = threadGeneration.current;
    wasNearBottom.current = false;
    setLoading(true);
    setError("");
    try {
      const result = await getHistory({
        channelId,
        parentId: inThread ? thread : null,
        before: inThread ? threadBefore : rootBefore,
      });
      if (inThread && generation !== threadGeneration.current) return;
      if (result.data) {
        merge(result.data.messages);
        if (inThread) {
          setThreadOlder(result.data.messages.length === 40);
          setThreadBefore(result.data.messages[0]?.created_seq ?? null);
        } else {
          setOlder(result.data.messages.length === 40);
          setRootBefore(result.data.messages[0]?.created_seq ?? null);
        }
      } else setError(result.error ?? "History unavailable.");
    } catch {
      if (!inThread || generation === threadGeneration.current) setError("History unavailable. Please retry.");
    } finally {
      if (!inThread || generation === threadGeneration.current) setLoading(false);
    }
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
    ) ?? (thread ? replies : roots);
  const firstUnreadId = visible.find(
    (m) =>
      m.author_id !== userId &&
      !m.deleted_at &&
      BigInt(m.created_seq) > BigInt(chat.lastRead),
  )?.id;
  const moderator = ["owner", "administrator", "moderator"].includes(chat.role);
  return (
    <section
      className="chat-workspace panel"
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
        <button className="chat-text-button" aria-expanded={searchOpen} disabled={composerLocked} onClick={() => { setSearchOpen(!searchOpen); if (searchOpen) setSearchResults(null); }}>Search channel</button>
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
        <>
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
                disabled={composerLocked}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search this channel…"
                minLength={2}
                maxLength={100}
              />
            </label>
            <button
              type="submit"
              className="button secondary"
              disabled={loading || composerLocked}
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
          {thread && !searchResults && (
            <div className="chat-thread-heading">
              <h2>Thread</h2>
              <span>
                {root?.author_name}:{" "}
                {root?.deleted_at
                  ? "Message deleted"
                  : root?.body.slice(0, 100)}
              </span>
              <button
                className="chat-text-button"
                disabled={composerLocked}
                onClick={closeThread}
              >
                Back to channel
              </button>
            </div>
          )}
          {searchResults && (
            <h2 className="chat-result-title">Search results</h2>
          )}
          <div
            className="chat-message-list"
            aria-label={
              searchResults
                ? "Search results"
                : thread
                  ? "Thread messages"
                  : "Channel messages"
            }
            tabIndex={0}
            onScroll={(e) => {
              const el = e.currentTarget;
              wasNearBottom.current =
                el.scrollHeight - el.scrollTop - el.clientHeight < 120;
            }}
          >
            {!searchResults && (thread ? threadOlder : older) && (
              <button
                className="button secondary"
                disabled={loading}
                onClick={() => void olderMessages(!!thread)}
              >
                Load older messages
              </button>
            )}
            {!visible.length && (
              <div className="chat-empty">
                <h2>
                  {searchResults
                    ? "No messages found"
                    : thread
                      ? "Start a reply"
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
                  replyDisabled={composerLocked}
                  moderator={moderator}
                  onMerge={merge}
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
            canPost={chat.canPost} connection={chat.status} hidden={!!searchResults}
            parentId={thread} reply={allMessages.find((m) => m.id === replyTo) ?? root}
            onCancelReply={closeThread} onLocked={setComposerLocked}
            onTyping={chat.indicateTyping}
            onSent={(message) => { merge([message]); wasNearBottom.current = true; void chat.refresh(); }}
          />
        </>
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
