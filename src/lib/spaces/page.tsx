import "server-only";
import { requireUser } from "../auth/session";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { SpaceWorkspace } from "../../components/spaces/Spaces";
import type { Context } from "./types";
export async function spacePage(
  view: "faith" | "events" | "notifications" | "prayer" | "event",
  resource?: string,
  community?: string,
) {
  if (resource && !z.uuid().safeParse(resource).success) notFound();
  const { client } = await requireUser(
    view === "faith"
      ? "/faith"
      : view === "events"
        ? "/events"
        : "/notifications",
  );
  if(view === 'event' && resource){const link=await client.from('faith_study_hangouts').select('event_id').eq('event_id',resource).maybeSingle();if(link.data){const e=await client.from('events').select('community_id').eq('id',resource).maybeSingle();if(e.data)redirect(`/faith-circles/${e.data.community_id}/hangouts/${resource}`);}}
  if(view === 'prayer' && resource){
    const prayer=await client.from('prayer_requests').select('id,community_id,circle_scope').eq('id',resource).maybeSingle();
    if(prayer.data?.circle_scope)redirect(`/faith-circles/${prayer.data.community_id}/prayers/${resource}`);
  }
  const r = await client.rpc("space_read", { p_view: "context" });
  return (
    <SpaceWorkspace
      key={`${view}:${resource || ""}:${community||""}`}
      initialCommunity={community && z.uuid().safeParse(community).success ? community : undefined}
      view={view}
      resource={resource || null}
      context={r.data as Context | null}
      unavailable={!!r.error}
    />
  );
}
