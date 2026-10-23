"use client";
import { useEffect, useState, useRef } from "react";
import { RealtimeClient } from "@supabase/supabase-js";
export function usePrivateUpdates(
  config: { url: string; key: string },
  conversation: string | null,
  refresh: () => Promise<void>,
) {
  const callback = useRef(refresh);
  useEffect(() => {
    callback.current = refresh;
  }, [refresh]);
  const [status, setStatus] = useState("Connecting");
  useEffect(() => {
    let stopped = false,
      busy = false;
    let socket: RealtimeClient | undefined;
    let debounce: ReturnType<typeof setTimeout>;
    const invalidate = () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => void callback.current(), 100);
    };
    async function connect() {
      if (stopped || busy) return;
      busy = true;
      try {
        if (!navigator.onLine) {
          setStatus("Offline");
          return;
        }
        const r = await fetch(
          `/api/people/session${conversation ? `?conversation=${conversation}` : ""}`,
          { cache: "no-store" },
        );
        if (!r.ok) {
          setStatus(r.status === 403 ? "Access unavailable" : "Reconnecting");
          invalidate();
          return;
        }
        const session = await r.json();
        if (stopped) return;
        if (socket) {
          await socket.removeAllChannels();
          socket.disconnect();
        }
        socket = new RealtimeClient(new URL("/realtime/v1", config.url).href, {
          params: { apikey: config.key },
        });
        await socket.setAuth(session.access_token);
        socket
          .channel(session.topic, { config: { private: true } })
          .on("broadcast", { event: "changed" }, invalidate)
          .subscribe((state) => {
            if (stopped) return;
            setStatus(
              state === "SUBSCRIBED"
                ? "Live"
                : navigator.onLine
                  ? "Reconnecting"
                  : "Offline",
            );
            if (state === "SUBSCRIBED") invalidate();
          });
      } catch {
        if (!stopped) setStatus(navigator.onLine ? "Reconnecting" : "Offline");
      } finally {
        busy = false;
      }
    }
    const offline = () => setStatus("Offline");
    const online = () => void connect();
    const visible = () => {
      if (document.visibilityState === "visible") {
        invalidate();
        void connect();
      }
    };
    void connect();
    const retry = setInterval(() => void connect(), 60000);
    const reconcile = setInterval(invalidate, 15000);
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    document.addEventListener("visibilitychange", visible);
    return () => {
      stopped = true;
      clearInterval(retry);
      clearInterval(reconcile);
      clearTimeout(debounce);
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
      document.removeEventListener("visibilitychange", visible);
      if (socket) {
        void socket.removeAllChannels();
        socket.disconnect();
      }
    };
  }, [config.url, config.key, conversation]);
  return status;
}
