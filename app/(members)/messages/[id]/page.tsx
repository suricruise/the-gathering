import { notFound } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/src/lib/auth/session";
import { publicConfig } from "@/src/lib/config";
import { DirectConversation } from "@/src/components/people/People";
export const dynamic = "force-dynamic";
export default async function ConversationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const { client } = await requireUser("/messages");
  const r = await client.rpc("dm_history", { p_conversation: id });
  if (r.error || !r.data) notFound();
  return (
    <DirectConversation key={id} initial={r.data} config={publicConfig()!} />
  );
}
