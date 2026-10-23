import Link from "next/link";
import { ChatWorkspace } from "@/src/components/chat/ChatWorkspace";
import { publicConfig } from "@/src/lib/config";
import type { ChatPage } from "@/src/lib/chat/types";
import { z } from "zod";
import { ChannelNavigation } from "@/src/components/communities/ChannelNavigation";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/src/lib/auth/session";
import { EmptyState, PageHeading } from "@/src/components/ui";
import { communityDetail } from "@/src/lib/communities/data";
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
  const { data: community } = await client
    .from("communities")
    .select("slug,name")
    .eq("id", channel.community_id)
    .single();
  if (!community) notFound();
  const { data: channels, error: listError } = await client
    .from("channels")
    .select("id,name,kind")
    .eq("community_id", channel.community_id)
    .order("position")
    .order("name");
  if (listError) throw new Error("Channels could not be loaded.");
  const history =
    channel.kind === "text"
      ? await client.rpc("chat_page", { p_channel: id })
      : null;
  const config = publicConfig();
  const shared = (await searchParams).message;
  return (
    <div className="page live-channel">
      <Link className="back-link" href={`/communities/${community.slug}`}>
        ← {community.name}
      </Link>
      <PageHeading
        eyebrow={channel.is_private ? "PRIVATE CHANNEL" : "COMMUNITY CHANNEL"}
        title={`${channel.kind === "text" ? "#" : "◉"} ${channel.name}`}
        description={channel.description}
      />
      <div className="two-column">
        <ChannelNavigation channels={channels ?? []} active={id} />
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
        ) : (
          <section className="panel padded">
            <EmptyState
              title={
                channel.kind === "text"
                  ? "Messaging is unavailable"
                  : "Your voice space is ready"
              }
              description={
                channel.kind === "text"
                  ? "Message history could not be loaded. Please retry; the site administrator may need to apply the messaging migrations."
                  : "Channel access is connected. Voice transport is not connected yet."
              }
            />
            {channel.kind === "text" ? (
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
            ) : (
              <button className="button secondary" disabled>
                Voice connection unavailable
              </button>
            )}
          </section>
        )}
      </div>
    </div>
  );
}

function idSchemaForMessage(value: unknown) {
  const parsed = z.uuid().safeParse(value);
  return parsed.success ? parsed.data : undefined;
}
