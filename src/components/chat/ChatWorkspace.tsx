"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  getHistory,
  getMessage,
  markRead,
  sendMessage,
} from "../../lib/chat/actions";
import type { Attachment, ChatMessage, ChatPage } from "../../lib/chat/types";
import { useChannelChat } from "./useChannelChat";
import { MessageItem } from "./MessageItem";
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
  const [draft, setDraft] = useState("");
  const [files, setFiles] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState<string | null>(null);
  const [thread, setThread] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [older, setOlder] = useState(initial.messages.length === 40);
  const [rootBefore, setRootBefore] = useState(
    initial.messages[0]?.created_seq ?? null,
  );
  const [threadBefore, setThreadBefore] = useState<string | null>(null);
  const [threadOlder, setThreadOlder] = useState(false);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<ChatMessage[] | null>(
    null,
  );
  const [searchBefore, setSearchBefore] = useState<string | null>(null);
  const [searchMore, setSearchMore] = useState(false);
  const [highlight, setHighlight] = useState(sharedMessage ?? "");
  const typingStop = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const bottom = useRef<HTMLDivElement>(null);
  const wasNearBottom = useRef(true);
  const seen = useRef("0");
  const roots = allMessages.filter((m) => m.parent_id === null);
  const replies = allMessages.filter((m) => m.parent_id === thread);
  const root = allMessages.find((m) => m.id === thread);
  const openThread = useCallback(
    async (m: ChatMessage) => {
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
        if (result.data) {
          merge(result.data.messages);
          setThreadOlder(result.data.messages.length === 40);
          setThreadBefore(result.data.messages[0]?.created_seq ?? null);
        } else setError(result.error ?? "Thread unavailable.");
      } catch {
        setError("Thread unavailable. Please retry.");
      } finally {
        setLoading(false);
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
      setFiles([]);
      setDraft("");
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
  useEffect(() => () => clearTimeout(typingStop.current), []);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (
      sending ||
      uploading ||
      !chat.canPost ||
      (!draft.trim() && !files.length)
    )
      return;
    const id = attempt ?? crypto.randomUUID();
    setAttempt(id);
    setSending(true);
    setError("");
    chat.indicateTyping(false);
    try {
      const result = await sendMessage({
        id,
        channelId,
        body: draft,
        parentId: thread,
        replyToId: thread ? replyTo : null,
        attachments: files.map((f) => f.id),
      });
      if (result.data) {
        merge([result.data]);
        setDraft("");
        setFiles([]);
        setAttempt(null);
        wasNearBottom.current = true;
        void chat.refresh();
      } else {
        setError(
          result.error ?? "Message not sent. Retry with the same message ID.",
        );
      }
    } catch {
      setError(
        "Message delivery was not confirmed. Retry uses the same ID to prevent duplicates.",
      );
    } finally {
      setSending(false);
    }
  }
  async function upload(list: FileList | null) {
    if (!list || uploading || sending) return;
    if (files.length + list.length > 4) {
      setError("Attach up to four files per message.");
      return;
    }
    setUploading(true);
    setError("");
    try {
      for (const file of Array.from(list)) {
        if (file.size > 3 * 1024 * 1024)
          throw Error("Choose files up to 3 MB.");
        const form = new FormData();
        form.set("channel", channelId);
        form.set("file", file);
        const response = await fetch("/api/chat/upload", {
          method: "POST",
          body: form,
        });
        const result = await response.json();
        if (!response.ok) throw Error(result.error ?? "Upload unavailable.");
        setFiles((previous) => [...previous, result as Attachment]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed. Please retry.");
    } finally {
      setUploading(false);
    }
  }
  async function olderMessages(inThread: boolean) {
    wasNearBottom.current = false;
    setLoading(true);
    setError("");
    try {
      const result = await getHistory({
        channelId,
        parentId: inThread ? thread : null,
        before: inThread ? threadBefore : rootBefore,
      });
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
      setError("History unavailable. Please retry.");
    } finally {
      setLoading(false);
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
          <form
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
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search this channel…"
                minLength={2}
                maxLength={100}
              />
            </label>
            <button
              type="submit"
              className="button secondary"
              disabled={loading}
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
          </form>
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
                onClick={() => {
                  setThread(null);
                  setReplyTo(null);
                }}
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
            {visible.map((m) => (
              <div key={m.id}>
                {!searchResults &&
                  m.id === firstUnreadId && (
                    <div className="chat-unread-divider">Unread messages</div>
                  )}
                <MessageItem
                  message={m}
                  userId={userId}
                  canPost={chat.canPost}
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
          {!searchResults && (
            <form className="chat-composer" onSubmit={submit}>
              {thread && (
                <p className="muted">
                  Replying in thread
                  {replyTo && replyTo !== thread ? " to a message" : ""}
                </p>
              )}
              <label>
                <span className="sr-only">
                  {thread ? "Thread reply" : `Message ${channelName}`}
                </span>
                <textarea
                  value={draft}
                  disabled={!chat.canPost || sending}
                  maxLength={4000}
                  placeholder={
                    chat.canPost
                      ? `Message #${channelName}`
                      : "This channel is read-only"
                  }
                  onChange={(e) => {
                    setDraft(e.target.value);
                    if (attempt) setAttempt(null);
                    chat.indicateTyping(!!e.target.value.trim());
                    clearTimeout(typingStop.current);
                    typingStop.current = setTimeout(
                      () => chat.indicateTyping(false),
                      4000,
                    );
                  }}
                />
              </label>
              {files.length > 0 && (
                <ul className="chat-staged-files">
                  {files.map((f) => (
                    <li key={f.id}>
                      {f.filename}
                      <button
                        type="button"
                        disabled={sending}
                        className="chat-text-button"
                        onClick={() =>
                          setFiles((previous) =>
                            previous.filter((x) => x.id !== f.id),
                          )
                        }
                      >
                        Remove attachment
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="chat-composer-footer">
                <label className="chat-upload">
                  Attach files
                  <input
                    type="file"
                    multiple
                    accept="image/jpeg,image/png,image/webp,image/gif,application/pdf,text/plain,text/csv,text/markdown,.txt,.md,.csv"
                    disabled={
                      !chat.canPost || sending || uploading || files.length >= 4
                    }
                    onChange={(e) => {
                      void upload(e.target.files);
                      e.target.value = "";
                    }}
                  />
                </label>
                <span className="muted">
                  {uploading
                    ? "Uploading…"
                    : `${draft.length}/4000 · Markdown supported · Files up to 3 MB`}
                </span>
                <button
                  className="button primary"
                  type="submit"
                  disabled={
                    !chat.canPost ||
                    sending ||
                    uploading ||
                    (!draft.trim() && !files.length)
                  }
                >
                  {sending
                    ? "Sending…"
                    : attempt
                      ? "Retry message"
                      : "Send message"}
                </button>
              </div>
            </form>
          )}
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
