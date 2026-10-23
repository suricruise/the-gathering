"use client";
import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { fetchPeople as getPeople, heartbeat } from "../../lib/people/client";
import type { PeopleHome } from "../../lib/people/types";
import { usePrivateUpdates } from "./usePrivateUpdates";
const Context = createContext<{
  home: PeopleHome | null;
  error: string;
  refresh: () => Promise<void>;
  status: string;
} | null>(null);
export const usePeople = () => useContext(Context);
export function PeopleProvider({
  config,
  children,
}: {
  config: { url: string; key: string };
  children: ReactNode;
}) {
  const [home, setHome] = useState<PeopleHome | null>(null),
    [error, setError] = useState("");
  const refresh = useCallback(async () => {
    try {
      const r = await getPeople();
      if (r.data) {
        setHome(r.data);
        setError("");
      } else {
        setError(r.error || "People unavailable.");
        if (r.denied) setHome(null);
      }
    } catch {
      setError("People unavailable. Please retry.");
    }
  }, []);
  const status = usePrivateUpdates(config, null, refresh);
  useEffect(() => {
    void refresh();
    const pulse = () => {
      if (document.visibilityState === "visible") void heartbeat();
    };
    pulse();
    const t = setInterval(pulse, 45000);
    return () => clearInterval(t);
  }, [refresh]);
  return (
    <Context.Provider value={{ home, error, refresh, status }}>
      {children}
    </Context.Provider>
  );
}
export function PeopleSidebar() {
  const p = usePeople();
  if (!p) return null;
  return (
    <div className="friend-list">
      <p>Friends · status shared by permission</p>
      {p.error ? (
        <p role="status">Friends unavailable.</p>
      ) : !p.home ? (
        <p>Loading friends…</p>
      ) : (
        p.home.friends
          .filter((f) => f.relationship === "friends")
          .slice(0, 8)
          .map((f) => (
            <Link className="friend-row" href="/messages" key={f.id}>
              <span>
                <strong>{f.name}</strong>
                <small>
                  {f.online === null
                    ? "Status hidden"
                    : f.online
                      ? "Online"
                      : "Offline"}
                </small>
              </span>
            </Link>
          ))
      )}
      {p.home && !p.home.friends.some((f) => f.relationship === "friends") && (
        <p>No friends yet. Find your people below.</p>
      )}
    </div>
  );
}
export function PeopleBell() {
  const p = usePeople();
  if (!p) return null;
  const n = Number(p.home?.notification_unread) || 0;
  const dm =
    p.home?.conversations.reduce(
      (n, c) => n + (c.muted ? 0 : Number(c.unread)),
      0,
    ) || 0;
  return (
    <Link
      className="icon-button"
      href="/messages?tab=notifications"
      aria-label={`Notifications: ${n} unread friend updates, ${dm} unread messages`}
    >
      <Bell size={20} aria-hidden="true" />
      {n + dm > 0 && <span className="badge">{n + dm}</span>}
    </Link>
  );
}
