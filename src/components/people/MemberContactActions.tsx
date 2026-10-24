"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { memberContact, type MemberContact } from "../../lib/people/rail";
import { communityMemberAction } from "../../lib/communities/members";
import { peopleCommand } from "../../lib/people/actions";
import { usePeople } from "./PeopleProvider";
export function MemberContactActions({ initial }: { initial: MemberContact }) {
  const [person,setPerson]=useState(initial),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const people=usePeople(),router=useRouter();
  const relationship = people?.home?.friends.find(p=>p.id===initial.id)?.relationship || "none";
  useEffect(()=>{let active=true;void memberContact(initial.id).then(r=>{if(active){if(r.data)setPerson(r.data);else setError(r.error || "Member unavailable.");}}).catch(()=>{if(active)setError("Member services unavailable.");});return()=>{active=false;};},[initial.id,relationship]);
  async function run(operation:"request"|"accept"|"decline"|"cancel"|"remove"|"open"){
    if(busy)return;setBusy(true);setError("");
    try{
      const r=person.community&&(operation==="request"||operation==="open")?await communityMemberAction({community:person.community,target:person.id,operation}):await peopleCommand({operation,target:person.id});
      if(r.error){setError(r.error);return;}
      await people?.refresh();
      if(r.data?.id){router.push(`/messages/${r.data.id}`);return;}
      const updated=await memberContact(person.id);
      if(updated.data)setPerson(updated.data);else setError(updated.error || "Member unavailable.");
      router.refresh();
    }catch{setError("Request failed. Please retry.");}finally{setBusy(false);}
  }
  if(person.self)return null;
  return <div className="member-profile-actions">
    <div className="button-row">
      {person.relationship==="none"&&(person.can_request?<button className="button primary" disabled={busy} onClick={()=>void run("request")}>Add friend</button>:<p>Friend requests are turned off.</p>)}
      {person.relationship==="outgoing"&&<><span role="status">Request sent</span><button className="button secondary" disabled={busy} onClick={()=>void run("cancel")}>Cancel request</button></>}
      {person.relationship==="incoming"&&<><button className="button primary" disabled={busy} onClick={()=>void run("accept")}>Accept request</button><button className="button secondary" disabled={busy} onClick={()=>void run("decline")}>Decline</button></>}
      {person.relationship==="friends"&&<><span>Friends</span><button className="button secondary" disabled={busy} onClick={()=>void run("remove")}>Remove friend</button></>}
      {person.can_message&&<button className="button secondary" disabled={busy} onClick={()=>void run("open")}>Message</button>}
    </div>
    {error&&<p role="alert">{error}</p>}
  </div>;
}
