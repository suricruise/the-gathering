import Link from "next/link";
import { requireUser } from "@/src/lib/auth/session";
import { voiceConfig, roomService } from "@/src/lib/voice/server";
import { PageHeading, EmptyState } from "@/src/components/ui";
export const dynamic = "force-dynamic";
export default async function VoicePage() {
  const { client } = await requireUser("/voice");
  const { data: channels, error } = await client
    .from("channels")
    .select("id,name,description,community_id,is_private")
    .eq("kind", "voice")
    .order("position")
    .limit(200);
  const { data: communities } = await client
    .from("communities")
    .select("id,name")
    .limit(200);
  const { data: settings } = await client
    .from("voice_rooms")
    .select("channel_id,participant_limit,locked,epoch");
  let configured = false;
  const counts = new Map<string, number>();
  try {
    voiceConfig();
    configured = true;
    for (const room of await roomService().listRooms())
      counts.set(room.name, room.numParticipants);
  } catch {
    /* No invented presence when infrastructure is unavailable. */
  }
  return (
    <div className="page">
      <PageHeading
        eyebrow="REAL VOICE · YOUR PEOPLE"
        title="Pull up a chair."
        description="The Lounge, squads, game nights, and private spaces for your communities."
      />
      <p>Live WebRTC audio through LiveKit. No recording is enabled.</p>
      {!configured && (
        <p role="status" className="panel padded">
          Voice is not configured. An administrator must add LiveKit credentials
          and run the voice enforcement worker.
        </p>
      )}
      {error ? (
        <EmptyState
          title="Voice rooms could not be loaded"
          description="Please retry shortly."
        />
      ) : !channels?.length ? (
        <EmptyState
          title="No voice rooms available"
          description="Join a community to explore its voice rooms."
        />
      ) : (
        <div className="voice-grid">
          {channels.map((ch) => {
            const room = settings?.find((r) => r.channel_id === ch.id);
            const key = room
              ? `tg_${ch.id.replaceAll("-", "")}_${room.epoch.replaceAll("-", "")}`
              : "";
            return (
              <article key={ch.id} className="voice-card panel padded">
                <span className="eyebrow">
                  {communities?.find((c) => c.id === ch.community_id)?.name ||
                    "Community"}{" "}
                  · {ch.is_private ? "Private" : "Members"}
                </span>
                <h2>
                  {ch.name === "the-lounge"
                    ? "The Lounge"
                    : ch.name === "squad-up"
                      ? "Squad Up"
                      : ch.name.replaceAll("-", " ")}
                </h2>
                <p>{ch.description}</p>
                <p>
                  {counts.has(key)
                    ? `${counts.get(key)} connected`
                    : configured
                      ? "Open room to check availability"
                      : "Voice unavailable"}{" "}
                  · {room?.participant_limit ?? 12} places
                  {room?.locked ? " · Locked" : ""}
                </p>
                <Link href={`/channels/${ch.id}`} className="button secondary">
                  Open voice room
                </Link>
              </article>
            );
          })}
        </div>
      )}
      <section className="panel padded voice-guidelines">
        <h2>Good company starts with good comms.</h2>
        <p>
          Respect personal boundaries. Make room for every voice. Ask before
          recording on any device.
        </p>
      </section>
    </div>
  );
}
