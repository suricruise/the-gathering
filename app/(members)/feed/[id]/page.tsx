import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/src/lib/auth/session";
import { SocialPostDetail } from "@/src/components/social/SocialFeed";
import { PageHeading } from "@/src/components/ui";
export const dynamic = "force-dynamic";
export default async function PostPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const { client, user } = await requireUser("/feed");
  const r = await client.rpc("social_post", { p_id: id });
  if (r.error || !r.data) notFound();
  return (
    <div className="page social-page">
      <Link href="/feed" className="back-link">
        ← Your feed
      </Link>
      <PageHeading
        eyebrow="A MOMENT SHARED"
        title="The conversation continues."
        description="Shared with the audience chosen by its author."
      />
      <SocialPostDetail initial={r.data} userId={user.id} />
    </div>
  );
}
