"use client";
import { useEffect, useState } from "react";
import { communityPresence } from "../../lib/people/rail";
import { heartbeat } from "../../lib/people/client";
export function CommunityPresencePreference() {
  const [share,setShare] = useState<boolean|null>(null), [busy,setBusy] = useState(false), [message,setMessage] = useState("");
  useEffect(()=>{let active=true;void communityPresence().then(r=>{if(active){if(r.data)setShare(r.data.share);else setMessage(r.error || "Preference unavailable.");}}).catch(()=>{if(active)setMessage("Preference unavailable. Reload to retry.");});return()=>{active=false;};},[]);
  async function save(value:boolean){setBusy(true);setMessage("");try{const r=await communityPresence(value);if(r.data){setShare(r.data.share);setMessage("Community presence saved.");if(document.visibilityState==="visible")void heartbeat();}else setMessage(r.error || "Preference unavailable.");}catch{setMessage("Could not save. Please retry.");}finally{setBusy(false);}}
  return <section className="community-presence-preference"><h3>Community online status</h3>
    <label><input type="checkbox" checked={share===true} disabled={share===null||busy} onChange={e=>void save(e.target.checked)}/>Share online status with fellow community members</label>
    <p>On by default. You can turn this off at any time. When enabled, your name appears in Online members for communities you share. Friends-only presence remains separate. Status expires after 90 seconds without activity; exact activity times are never shown.</p>
    {message&&<p role="status">{message}</p>}
  </section>;
}
