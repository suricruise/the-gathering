"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePeople } from "./PeopleProvider";
import { railMembers } from "../../lib/people/rail";
import type { Person } from "../../lib/people/types";
function PersonRow({ person }: { person: Person }) {
  const status = person.online === null ? "Status hidden" : person.online ? "Online" : "Offline";
  return <li><Link aria-label={person.name || person.username} title={status} className="rail-person" href={`/members/${person.id}`}>
    <span className="rail-person-picture">{person.avatar ? <img src={`/api/avatars/${person.id}`} alt="" width={32} height={32} /> : <span className="rail-person-avatar" aria-hidden="true">{(person.name || person.username).slice(0,1).toUpperCase()}</span>}<span className={`rail-presence ${person.online === null ? "hidden" : person.online ? "online" : "offline"}`} aria-hidden="true" /></span>
    <span>{person.name || person.username}</span>
  </Link></li>;
}
export function PeopleRail({ channel }: { channel: string | null }) {
  const people = usePeople();
  const [members,setMembers] = useState<Person[]>([]), [error,setError] = useState(""), [loading,setLoading] = useState(true), [next,setNext] = useState<string|null>(null);
  const request = useRef(0);
  const load = useCallback(async (after: string | null = null, quiet = false) => {
    const token = ++request.current;
    if (!quiet) setLoading(true);
    try {
      const result = await railMembers({ channel, after });
      if (token !== request.current) return;
      if (result.data) {
        const rows = result.data.items.slice(0,25);
        setMembers(old => after ? [...new Map([...old,...rows].map(p => [p.id,p])).values()] : rows);
        setNext(result.data.items.length > 25 ? rows.at(-1)!.id : null);setError("");
      } else {setMembers([]);setNext(null);setError(result.error || "Members unavailable.");}
    } catch { if(token === request.current){setMembers([]);setNext(null);setError("Members unavailable. Please retry.");} }
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
  const byStatus = (a: Person,b: Person) => Number(b.online === true)-Number(a.online === true) || (a.name || a.username).localeCompare(b.name || b.username);
  const friends = (people?.home?.friends.filter(p=>p.relationship === "friends") || []).sort(byStatus);
  return <>
    <section className="rail-people-section" aria-label="Friends"><h3>Friends</h3>
      {people?.error ? <p role="status">Friends unavailable. <button onClick={()=>void people.refresh()}>Retry</button></p> : !people?.home ? <p role="status">Loading friends…</p> : friends.length ? <ul>{friends.map(person=><PersonRow key={person.id} person={person}/>)}</ul> : <p>No friends yet.</p>}
    </section>
    <section className="rail-people-section" aria-label="Members"><h3>Members</h3>
      {error ? <p role="status">{error} <button onClick={()=>void load()}>Retry</button></p> : loading && !members.length ? <p role="status">Loading members…</p> : members.length ? <ul>{members.filter(p=>!friends.some(f=>f.id===p.id)).sort(byStatus).map(person=><PersonRow key={person.id} person={person}/>)}</ul> : <p>No other members in this community.</p>}
      {next && <button disabled={loading} onClick={()=>void load(next)}>Show more members</button>}
    </section>
  </>;
}
