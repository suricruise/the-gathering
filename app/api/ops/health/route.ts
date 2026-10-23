import { createHash, timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/src/lib/supabase/admin";
import { roomService } from "@/src/lib/voice/server";
import { operationalEvent } from "@/src/lib/operations/monitoring";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 15;
export async function GET(request: Request) {
  const headers = {
    "Cache-Control": "private, no-store",
    "X-Robots-Tag": "noindex",
    Vary: "Authorization",
  };
  const token = process.env.OPS_HEALTH_TOKEN;
  const received = request.headers.get("authorization") || "";
  if (!token || token.length < 32)
    return Response.json({ status: "unavailable" }, { status: 503, headers });
  const hash = (s: string) => createHash("sha256").update(s).digest();
  if (!timingSafeEqual(hash(received), hash("Bearer " + token)))
    return Response.json({ status: "unauthorized" }, { status: 401, headers });
  try {
    const db = await createAdminClient()
      .rpc("operational_health")
      .abortSignal(AbortSignal.timeout(5000));
    if (db.error || !db.data) throw Error("Unavailable");
    let livekit = false;
    try {
      await roomService().listRooms();
      livekit = true;
    } catch {
      /* Return only a boolean, never provider error payloads. */
    }
    const checks = { ...db.data, livekit };
    const healthy = Object.values(checks).every((v) => v === true);
    if (!healthy) operationalEvent("health_failed");
    return Response.json(
      { status: healthy ? "ok" : "degraded", checks },
      { status: healthy ? 200 : 503, headers },
    );
  } catch {
    operationalEvent("health_failed");
    return Response.json({ status: "unavailable" }, { status: 503, headers });
  }
}
