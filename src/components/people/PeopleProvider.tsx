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
  chatRevision: number;
} | null>(null);
export const usePeople = () => useContext(Context);
export function PeopleProvider({
  config,
  children,
}: {
  config: { url: string; key: string };
  children: ReactNode;
}) {
  const [chatRevision,setChatRevision]=useState(0);
  const summary=useCallback(()=>setChatRevision(value=>value+1),[]);
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
  const status = usePrivateUpdates(config, null, refresh, summary);
  useEffect(() => {
    void refresh();
    let last=0;
    const pulse=()=>{if(document.visibilityState==="visible"&&navigator.onLine&&Date.now()-last>=15000){last=Date.now();void heartbeat();}};
    window.addEventListener("online",pulse);window.addEventListener("focus",pulse);document.addEventListener("visibilitychange",pulse);
    pulse();
    const t = setInterval(pulse, 45000);
    return () => {clearInterval(t);window.removeEventListener("online",pulse);window.removeEventListener("focus",pulse);document.removeEventListener("visibilitychange",pulse);};
  }, [refresh]);
  return (
    <Context.Provider value={{ home, error, refresh, status, chatRevision }}>
      {children}
    </Context.Provider>
  );
}
export function PeopleBell() {
  const p = usePeople();
  if (!p) return null;
  const n =
    Number(p.home?.all_notification_unread ?? p.home?.notification_unread) || 0;
  const dm =
    p.home?.conversations.reduce(
      (n, c) => n + (c.muted ? 0 : Number(c.unread)),
      0,
    ) || 0;
  return (
    <Link
      className="icon-button"
      href="/notifications"
      aria-label={`Notifications: ${n} unread updates, ${dm} unread messages`}
    >
      <Bell size={20} aria-hidden="true" />
      {n + dm > 0 && <span className="badge">{n + dm}</span>}
    </Link>
  );
}
