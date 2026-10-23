// No provider error messages, URLs, credentials, room names or identities in logs.
const codes = new Set([
  "42501",
  "PGRST202",
  "PGRST204",
  "PGRST301",
  "PGRST302",
  "PGRST303",
  "unauthenticated",
  "permission_denied",
  "unavailable",
  "deadline_exceeded",
  "not_found",
  "resource_exhausted",
  "internal",
  "invalid_api_key",
  "ECONNREFUSED",
  "ENOTFOUND",
  "ETIMEDOUT",
  "ECONNRESET",
  "invalid_snapshot",
]);
const statuses = new Set([400, 401, 403, 404, 408, 429, 500, 502, 503, 504]);
export class VoiceEnforcementError extends Error {
  constructor(stage, error) {
    const rawCode = error?.code ?? error?.cause?.code;
    const code = codes.has(rawCode) ? rawCode : "unknown";
    const rawStatus = error?.status ?? error?.statusCode;
    const status = statuses.has(rawStatus) ? rawStatus : "unknown";
    let hint;
    if (stage.startsWith("supabase")) {
      hint =
        code === "PGRST202" || code === "PGRST204"
          ? "Check that the worker uses the correct Supabase project and its Phase 6 migrations are installed."
          : "Check the worker's Supabase project URL and current server-only secret/service-role key; a publishable key cannot run enforcement.";
    } else {
      hint =
        "Check the worker's LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET belong to the same LiveKit project and that its API is reachable.";
    }
    super(
      `Voice enforcement failed [stage=${stage} code=${code} status=${status}]. ${hint} New admissions remain blocked when the last successful pass is older than 15 seconds.`,
    );
  }
}
async function operation(stage, fn) {
  try {
    return await fn();
  } catch (error) {
    throw new VoiceEnforcementError(stage, error);
  }
}
export function enforcementDiagnostic(error) {
  return error instanceof VoiceEnforcementError
    ? error.message
    : "Voice enforcement failed [stage=unknown]. Check worker configuration and connectivity; no successful health heartbeat was recorded.";
}
export async function enforceVoice(admin, livekit) {
  const { data, error } = await operation("supabase-snapshot", () =>
    admin.rpc("voice_enforcement_snapshot"),
  );
  if (error || !Array.isArray(data?.rooms) || !Array.isArray(data?.sessions))
    throw new VoiceEnforcementError(
      "supabase-snapshot",
      error ?? { code: "invalid_snapshot" },
    );
  const allowedRooms = new Map(data.rooms.map((r) => [r.room, r]));
  const sessions = new Map(
    data.sessions.map((s) => [`${s.room}:${s.identity}`, s]),
  );
  for (const room of await operation("livekit-list-rooms", () =>
    livekit.listRooms(),
  )) {
    if (!/^tg_[a-f0-9]{32}_[a-f0-9]{32}$/.test(room.name)) continue;
    if (!allowedRooms.has(room.name)) {
      await operation("livekit-delete-room", () =>
        livekit.deleteRoom(room.name),
      );
      continue;
    }
    for (const p of await operation("livekit-list-participants", () =>
      livekit.listParticipants(room.name),
    )) {
      const allowed = sessions.get(`${room.name}:${p.identity}`);
      let ticket;
      try {
        ticket = JSON.parse(p.metadata).ticket;
      } catch {
        /* Missing or malformed tickets are rejected below. */
      }
      if (!allowed || allowed.ticket !== ticket)
        await operation("livekit-remove-participant", () =>
          livekit.removeParticipant(room.name, p.identity, {
            revokeTokenTs: BigInt(Math.floor(Date.now() / 1000)),
          }),
        );
    }
  }
  const beat = await operation("supabase-heartbeat", () =>
    admin.rpc("voice_worker_heartbeat"),
  );
  if (beat.error)
    throw new VoiceEnforcementError("supabase-heartbeat", beat.error);
}
