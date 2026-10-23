import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/src/lib/auth/session";
import { SquadDetail } from "@/src/components/squads/SquadUp";
import { voiceConfig } from "@/src/lib/voice/server";
export const dynamic = "force-dynamic";
export default async function SquadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const { client } = await requireUser("/squad-up");
  const r = await client.rpc("squad_detail", { p_session: id });
  if (r.error || !r.data) notFound();
  let configured = false;
  try {
    voiceConfig();
    configured = true;
  } catch {
    /* The UI explains missing infrastructure. */
  }
  return (
    <div className="page squad-detail-page">
      <Link className="back-link" href="/squad-up">
        ← Squad Up
      </Link>
      <SquadDetail initial={r.data} voiceConfigured={configured} />
    </div>
  );
}
