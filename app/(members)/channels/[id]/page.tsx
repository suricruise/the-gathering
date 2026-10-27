import { VoiceRoomPanel } from "@/src/components/voice/VoiceControls";
import { voiceConfig } from "@/src/lib/voice/server";
import Link from "next/link";
import { ChatWorkspace } from "@/src/components/chat/ChatWorkspace";
import { publicConfig } from "@/src/lib/config";
import type { ChatPage } from "@/src/lib/chat/types";
import { z } from "zod";
import { ChannelWorkspaceLayout } from "@/src/components/chat/ChannelWorkspaceLayout";
import { workspaceNavigation } from "@/src/lib/chat/workspace";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/src/lib/auth/session";
import { EmptyState, PageHeading } from "@/src/components/ui";
import { communityDetail, type Community } from "@/src/lib/communities/data";
export default async function ChannelPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ message?: string }>;
}) {
  const { id } = await params;
  const { client, user } = await requireUser(`/channels/${id}`);
  if (!z.uuid().safeParse(id).success) {
    const main = await communityDetail("the-gathering");
    const match = main?.channels.find((c) => c.name === id);
    if (match) redirect(`/channels/${match.id}`);
    return (
      <div className="page live-channel">
        <PageHeading
          eyebrow="COMMUNITY SPACES"
          title="Find your next conversation."
          description="Your channels belong to your communities."
        />
        <EmptyState
          title="Join a community to explore its channels"
          description="Channels are now connected to real community memberships."
        >
          <Link href="/communities" className="button primary">
            Explore communities
          </Link>
        </EmptyState>
      </div>
    );
  }
  const { data: channel, error } = await client
    .from("channels")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error("Channel services are unavailable.");
  if (!channel) notFound();
  let { data: community, error: communityError } = await client
    .from("communities")
    .select("id,slug,name,description,visibility,cover,community_headers(version)")
    .eq("id", channel.community_id)
    .maybeSingle<Community>();
  // Keep existing channel access working during an additive header migration.
  if (communityError?.code === "PGRST200") {
    const fallback = await client.from("communities")
      .select("id,slug,name,description,visibility,cover")
      .eq("id", channel.community_id).maybeSingle<Community>();
    community = fallback.data;
    communityError = fallback.error;
  }
  if (communityError) throw new Error("Community services are unavailable.");
  if (!community) notFound();
  const navigation = await workspaceNavigation(id);
  if (!navigation.data) throw new Error(navigation.error || "Community navigation unavailable.");
  let history =
    channel.kind === "text"
      ? await client.rpc("chat_conversation_page", { p_channel: id, p_mode: "initial" })
      : null;
  if (history?.error && ["42883", "PGRST202"].includes(history.error.code)) history = await client.rpc("chat_page", { p_channel: id });
  const config = publicConfig();
  const voiceSettings =
    channel.kind === "voice"
      ? await client
          .from("voice_rooms")
          .select("participant_limit,locked")
          .eq("channel_id", id)
          .maybeSingle()
      : null;
  const voiceRole =
    channel.kind === "voice"
      ? await client.rpc("community_my_role", {
          p_community: channel.community_id,
        })
      : null;
  let voiceConfigured = false;
  try {
    voiceConfig();
    voiceConfigured = true;
  } catch {
    /* Missing infrastructure keeps joining disabled. */
  }
  if(channel.kind==='voice'){const link=await client.from('faith_study_hangouts').select('event_id').eq('channel_id',id).maybeSingle();if(link.data)redirect(`/faith-circles/${channel.community_id}/hangouts/${link.data.event_id}`);}
  const shared = (await searchParams).message;
  return (
    <ChannelWorkspaceLayout key={community.id} community={community} channel={channel} initial={navigation.data}>
        {channel.kind === "text" &&
        history?.data &&
        !history.error &&
        config ? (
          <ChatWorkspace
            key={id}
            channelId={id}
            channelName={channel.name}
            userId={user.id}
            initial={history.data as ChatPage}
            url={config.url}
            publishableKey={config.key}
            sharedMessage={idSchemaForMessage(shared)}
          />
        ) : channel.kind === "voice" ? (
          <VoiceRoomPanel
            channel={id}
            name={channel.name}
            description={channel.description}
            role={voiceRole?.data}
            limit={voiceSettings?.data?.participant_limit ?? 12}
            locked={voiceSettings?.data?.locked ?? false}
            configured={voiceConfigured && !voiceSettings?.error}
          />
        ) : (
          <section className="panel padded">
            <EmptyState
              title="Messaging is unavailable"
              description="Message history could not be loaded. Please retry; the site administrator may need to apply the messaging migrations."
            />
            <div>
              <label className="field">
                Message
                <input placeholder="Messaging is not connected" disabled />
              </label>
              <button
                className="button secondary"
                disabled
                aria-label="Send message unavailable"
              >
                Send
              </button>
            </div>
          </section>
        )}
    </ChannelWorkspaceLayout>
  );
}

function idSchemaForMessage(value: unknown) {
  const parsed = z.uuid().safeParse(value);
  return parsed.success ? parsed.data : undefined;
}
