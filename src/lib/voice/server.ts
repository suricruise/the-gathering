import "server-only";
import {
  AccessToken,
  RoomServiceClient,
  TrackSource,
} from "livekit-server-sdk";
import type { VoiceAdmission } from "./validation";
export function voiceConfig() {
  const url = process.env.LIVEKIT_URL,
    key = process.env.LIVEKIT_API_KEY,
    secret = process.env.LIVEKIT_API_SECRET;
  if (!url || !key || !secret || secret.length < 32)
    throw new Error("Voice is not configured");
  const parsed = new URL(url);
  if (
    parsed.username ||
    parsed.password ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash ||
    !["wss:", "ws:"].includes(parsed.protocol) ||
    (parsed.protocol !== "wss:" &&
      !["localhost", "127.0.0.1"].includes(parsed.hostname))
  )
    throw new Error("Invalid LiveKit URL");
  return {
    url: parsed.origin,
    key,
    secret,
    host: parsed.origin.replace(/^ws/, "http"),
  };
}
export function roomService() {
  const c = voiceConfig();
  return new RoomServiceClient(c.host, c.key, c.secret, { requestTimeout: 5 });
}
export async function issueVoiceToken(
  identity: string,
  admission: VoiceAdmission,
) {
  const c = voiceConfig();
  const token = new AccessToken(c.key, c.secret, {
    identity,
    name: admission.name,
    ttl: 60,
    metadata: JSON.stringify({ ticket: admission.ticket }),
  });
  token.addGrant({
    room: admission.room,
    roomJoin: true,
    canSubscribe: true,
    canPublish: true,
    canPublishSources: [TrackSource.MICROPHONE],
    canPublishData: false,
    canUpdateOwnMetadata: false,
    roomAdmin: false,
    roomCreate: false,
    roomRecord: false,
  });
  return {
    token: await token.toJwt(),
    serverUrl: c.url,
    ticket: admission.ticket,
  };
}
export function isMissingRoom(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "not_found"
  );
}
export async function removeVoiceParticipant(room: string, identity: string) {
  try {
    await roomService().removeParticipant(room, identity, {
      revokeTokenTs: BigInt(Math.floor(Date.now() / 1000)),
    });
  } catch (e) {
    if (!isMissingRoom(e)) throw e;
  }
}
