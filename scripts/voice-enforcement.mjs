// Shared by the independent worker and real-service tests. No browser credentials.
export async function enforceVoice(admin, livekit) {
  const { data, error } = await admin.rpc("voice_enforcement_snapshot");
  if (error || !data?.rooms || !data?.sessions)
    throw Error("Voice authorization snapshot unavailable");
  const allowedRooms = new Map(data.rooms.map((r) => [r.room, r]));
  const sessions = new Map(
    data.sessions.map((s) => [`${s.room}:${s.identity}`, s]),
  );
  for (const room of await livekit.listRooms()) {
    if (!/^tg_[a-f0-9]{32}_[a-f0-9]{32}$/.test(room.name)) continue;
    const rule = allowedRooms.get(room.name);
    if (!rule) {
      await livekit.deleteRoom(room.name);
      continue;
    }
    for (const p of await livekit.listParticipants(room.name)) {
      const allowed = sessions.get(`${room.name}:${p.identity}`);
      let ticket;
      try {
        ticket = JSON.parse(p.metadata).ticket;
      } catch {
        /* Missing or malformed server ticket is rejected below. */
      }
      if (!allowed || allowed.ticket !== ticket) {
        await livekit.removeParticipant(room.name, p.identity, {
          revokeTokenTs: BigInt(Math.floor(Date.now() / 1000)),
        });
      }
    }
  }
  const beat = await admin.rpc("voice_worker_heartbeat");
  if (beat.error) throw Error("Voice enforcement heartbeat unavailable");
}
