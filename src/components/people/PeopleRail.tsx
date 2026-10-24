"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePeople } from "./PeopleProvider";
import { onlineMembers } from "../../lib/people/rail";
import type { Person } from "../../lib/people/types";
function PersonRow({ person }: { person: Person }) {
  return <li><Link className="rail-person" href={`/members/${person.id}`}>
    {person.avatar ? <img src={`/api/avatars/${person.id}`} alt="" width={32} height={32} /> : <span className="rail-person-avatar" aria-hidden="true">{(person.name || person.username).slice(0,1).toUpperCase()}</span>}
    <span>{person.name || person.username}</span>
  </Link></li>;
}
export function PeopleRail({ channel }: { channel: string | null }) {
  const people = usePeople();
  const [online,setOnline] = useState<Person[]>([]), [error,setError] = useState(""), [loading,setLoading] = useState(true), [next,setNext] = useState<string|null>(null);
  const request = useRef(0);
  const load = useCallback(async (after: string | null = null, quiet = false) => {
    const token = ++request.current;
    if (!quiet) setLoading(true);
    try {
      const result = await onlineMembers({ channel, after });
      if (token !== request.current) return;
      if (result.data) {
        const rows = result.data.items.slice(0,25);
        setOnline(old => after ? [...new Map([...old,...rows].map(p => [p.id,p])).values()] : rows);
        setNext(result.data.items.length > 25 ? rows.at(-1)!.id : null);setError("");
      } else {setOnline([]);setNext(null);setError(result.error || "Online members unavailable.");}
    } catch { if(token === request.current){setOnline([]);setNext(null);setError("Online members unavailable. Please retry.");} }
    finally { if(token === request.current) setLoading(false); }
  }, [channel]);
  const relationships = people?.home?.friends.map(p=>`${p.id}:${p.relationship}`).join("|") || "";
  const blocks = people?.home?.blocks.map(p=>p.id).join("|") || "";
  useEffect(() => {
    void load();
    const refresh = () => {if(document.visibilityState === "visible" && navigator.onLine) void load(null,true);};
    const timer = setInterval(refresh,30000);
    window.addEventListener("online",refresh);document.addEventListener("visibilitychange",refresh);
    return () => {
      clearInterval(timer);window.removeEventListener("online",refresh);document.removeEventListener("visibilitychange",refresh);
      // Monotonic counter, never a DOM ref.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      request.current++;
    };
  }, [load,relationships,blocks]);
  const friends = people?.home?.friends.filter(p=>p.relationship === "friends") || [];
  return <>
    <section className="rail-people-section" aria-label="Friends"><h3>Friends</h3>
      {people?.error ? <p role="status">Friends unavailable. <button onClick={()=>void people.refresh()}>Retry</button></p> : !people?.home ? <p role="status">Loading friends…</p> : friends.length ? <ul>{friends.map(person=><PersonRow key={person.id} person={person}/>)}</ul> : <p>No friends yet.</p>}
    </section>
    <section className="rail-people-section" aria-label="Online members"><h3>Online members</h3>
      {error ? <p role="status">{error} <button onClick={()=>void load()}>Retry</button></p> : loading && !online.length ? <p role="status">Loading members…</p> : online.length ? <ul>{online.filter(p=>!friends.some(f=>f.id===p.id)).map(person=><PersonRow key={person.id} person={person}/>)}</ul> : <p>No members sharing online status.</p>}
      {next && <button disabled={loading} onClick={()=>void load(next)}>Show more members</button>}
    </section>
  </>;
}
