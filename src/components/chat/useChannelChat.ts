"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { RealtimeClient, type RealtimeChannel } from "@supabase/supabase-js";
import { getChanges, getHistory } from "../../lib/chat/actions";
import { reconcileMessages } from "../../lib/chat/reconcile";
import type { ChatMessage, ChatPage } from "../../lib/chat/types";
export function useChannelChat({
  channelId,
  userId,
  initial,
  url,
  publishableKey,
}: {
  channelId: string;
  userId: string;
  initial: ChatPage;
  url: string;
  publishableKey: string;
}) {
  const [messages, setMessages] = useState(initial.messages);
  const [status, setStatus] = useState("Connecting");
  const [denied, setDenied] = useState(false);
  const [canPost, setCanPost] = useState(false);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [role, setRole] = useState("member");
  const [typing, setTyping] = useState<
    Record<string, { name: string; until: number }>
  >({});
  const [unread, setUnread] = useState(initial.unread_count);
  const [lastRead, setLastRead] = useState(initial.last_read_seq);
  const [generation, setGeneration] = useState(0);
  const cursor = useRef(initial.watermark);
  const busy = useRef(false);
  const again = useRef(false);
  const lastTyping = useRef(0);
  const merge = useCallback(
    (items: ChatMessage[]) =>
      setMessages((previous) =>
        reconcileMessages(
          previous,
          items.filter((m) => m.channel_id === channelId),
        ),
      ),
    [channelId],
  );
  const lock = useCallback(() => {
    setDenied(true);
    setCanPost(false);
    setMessages([]);
    setTyping({});
    setStatus("Access unavailable");
  }, []);
  const refresh = useCallback(async () => {
    const result = await getHistory({ channelId });
    if (result.denied) {
      lock();
      return;
    }
    if (result.data) {
      merge(result.data.messages);
      setUnread(result.data.unread_count);
      setLastRead(result.data.last_read_seq);
      setRefreshVersion((value) => value + 1);
    }
  }, [channelId, lock, merge]);
  const catchUp = useCallback(async () => {
    if (busy.current) {
      again.current = true;
      return;
    }
    busy.current = true;
    try {
      do {
        again.current = false;
        for (let pages = 0; pages < 20; pages++) {
          const result = await getChanges(channelId, cursor.current);
          if (result.denied) {
            lock();
            return;
          }
          if (!result.data) {
            setStatus(navigator.onLine ? "Reconnecting" : "Offline");
            return;
          }
          merge(result.data);
          for (const item of result.data)
            if (BigInt(item.version) > BigInt(cursor.current))
              cursor.current = item.version;
          if (result.data.length < 200) break;
          if (pages === 19) {
            const latest = await getHistory({ channelId });
            if (latest.data) {
              setMessages(latest.data.messages);
              cursor.current = latest.data.watermark;
            }
          }
        }
      } while (again.current);
      await refresh();
    } catch {
      setStatus(navigator.onLine ? "Reconnecting" : "Offline");
    } finally {
      busy.current = false;
    }
  }, [channelId, merge, lock, refresh]);
  useEffect(() => {
    let stopped = false;
    let socket: RealtimeClient | undefined;
    let subscription: RealtimeChannel | undefined;
    let topic = "";
    let connecting = false;
    let eventTimer: ReturnType<typeof setTimeout> | undefined;
    const invalidate = () => {
      clearTimeout(eventTimer);
      eventTimer = setTimeout(() => {
        void catchUp();
      }, 80);
    };
    const connect = async () => {
      if (stopped || connecting) return;
      if (!navigator.onLine) {
        setStatus("Offline");
        return;
      }
      connecting = true;
      try {
        const response = await fetch(`/api/chat/session?channel=${channelId}`, {
          cache: "no-store",
        });
        if (response.status === 401 || response.status === 403) {
          lock();
          if (subscription && socket) await socket.removeChannel(subscription);
          return;
        }
        if (!response.ok) throw Error("Session unavailable");
        const session = await response.json();
        if (stopped) return;
        if (
          typeof session.topic !== "string" ||
          typeof session.access_token !== "string"
        )
          throw Error("Invalid session");
        setCanPost(session.can_post === true);
        setRole(session.role ?? "member");
        if (!socket)
          socket = new RealtimeClient(new URL("/realtime/v1", url).href, {
            params: { apikey: publishableKey, eventsPerSecond: 10 },
          });
        await socket.setAuth(session.access_token);
        if (subscription && topic === session.topic) {
          if (subscription.state === "joined") {
            setStatus("Live");
            void catchUp();
          } else setGeneration((v) => v + 1);
          return;
        }
        if (subscription) await socket.removeChannel(subscription);
        if (stopped) return;
        topic = session.topic;
        setStatus("Connecting");
        subscription = socket
          .channel(topic, {
            config: { private: true, broadcast: { self: false } },
          })
          .on("broadcast", { event: "changed" }, invalidate)
          .on("broadcast", { event: "receipt" }, invalidate)
          .on("broadcast", { event: "access_changed" }, () => {
            setGeneration((v) => v + 1);
          })
          .on("broadcast", { event: "typing" }, ({ payload }) => {
            if (
              stopped ||
              payload?.user_id === userId ||
              typeof payload?.user_id !== "string" ||
              typeof payload?.name !== "string"
            )
              return;
            const until = Date.parse(payload.until);
            if (!Number.isFinite(until) || until > Date.now() + 10000) return;
            setTyping((previous) => ({
              ...previous,
              [payload.user_id]: { name: payload.name.slice(0, 60), until },
            }));
          })
          .subscribe((state) => {
            if (stopped) return;
            if (state === "SUBSCRIBED") {
              setStatus("Live");
              setDenied(false);
              void catchUp();
            } else if (state === "CHANNEL_ERROR" || state === "TIMED_OUT")
              setStatus(navigator.onLine ? "Reconnecting" : "Offline");
            else if (state === "CLOSED")
              setStatus(navigator.onLine ? "Disconnected" : "Offline");
          });
      } catch {
        if (!stopped) setStatus(navigator.onLine ? "Reconnecting" : "Offline");
      } finally {
        connecting = false;
      }
    };
    // A new transport avoids reusing a closed Phoenix channel after going offline.
    const online = () => setGeneration((v) => v + 1);
    const offline = () => setStatus("Offline");
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    // Refresh in-memory JWT and enforce live access even if a revocation notice was lost.
    const check = setInterval(() => {
      void connect();
    }, 30000);
    const expire = setInterval(
      () =>
        setTyping((previous) =>
          Object.fromEntries(
            Object.entries(previous).filter(
              ([, item]) => item.until > Date.now(),
            ),
          ),
        ),
      1000,
    );
    void connect();
    return () => {
      stopped = true;
      clearInterval(check);
      clearInterval(expire);
      clearTimeout(eventTimer);
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
      if (socket) {
        void socket.removeAllChannels().catch(() => {});
        socket.disconnect();
      }
    };
  }, [channelId, userId, url, publishableKey, generation, catchUp, lock]);
  const indicateTyping = useCallback(
    (active: boolean) => {
      const now = Date.now();
      if (active && now - lastTyping.current < 3000) return;
      lastTyping.current = now;
      // Typing must not queue ahead of durable sends in Next's action dispatcher.
      void fetch("/api/chat/typing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel: channelId, active }),
      }).catch(() => {});
    },
    [channelId],
  );
  return {
    messages,
    refreshVersion,
    merge,
    status,
    denied,
    canPost,
    role,
    typing: Object.values(typing).map((t) => t.name),
    unread,
    lastRead,
    refresh,
    retryConnection: () => setGeneration((v) => v + 1),
    indicateTyping,
    lock,
  };
}
