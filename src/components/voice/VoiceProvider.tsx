"use client";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Room,
  RoomEvent,
  ConnectionState,
  Track,
  createLocalAudioTrack,
  type LocalAudioTrack,
} from "livekit-client";
import {
  RoomContext,
  RoomAudioRenderer,
  StartAudio,
  useConnectionState,
  useLocalParticipant,
  useParticipants,
} from "@livekit/components-react";
import type { VoiceCredentials } from "../../lib/voice/validation";
export async function voiceRequest(
  operation: string,
  body: object,
  keepalive = false,
) {
  const response = await fetch(`/api/voice/${operation}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
    keepalive,
  });
  const data = await response.json();
  if (!response.ok) throw Error(data.error || "Voice request failed.");
  return data;
}
type Session = VoiceCredentials & { channelName: string };
type VoiceContextValue = {
  room: Room;
  session: Session | null;
  state: ConnectionState;
  busy: boolean;
  error: string;
  deafened: boolean;
  muted: boolean;
  participants: ReturnType<typeof useParticipants>;
  recentChannels: string[];
  join: (id: string, name: string, microphone: boolean) => Promise<void>;
  leave: () => Promise<void>;
  toggleMic: () => Promise<void>;
  toggleDeafen: () => Promise<void>;
  setError: (message: string) => void;
};
const Context = createContext<VoiceContextValue | null>(null);
export const useVoice = () => useContext(Context);
export function VoiceProvider({ children }: { children: ReactNode }) {
  const [room] = useState(
    () =>
      new Room({
        adaptiveStream: false,
        dynacast: false,
        audioCaptureDefaults: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        disconnectOnPageLeave: true,
      }),
  );
  const state = useConnectionState(room);
  const { isMicrophoneEnabled, localParticipant } = useLocalParticipant({
    room,
  });
  const participants = useParticipants({ room });
  const [recentChannels,setRecentChannels]=useState<string[]>([]);
  const [session, setSession] = useState<Session | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [deafened, setDeafened] = useState(false);
  const current = useRef<Session | null>(null),
    joining = useRef(false),
    generation = useRef(0),
    resumeMic = useRef(false);
  const clearSession = () => {
    current.current = null;
    setSession(null);
    setDeafened(false);
  };
  async function leave() {
    generation.current++;
    // Keep admission serialized until any pending permission/connect attempt settles.
    if (!joining.current) setBusy(false);
    const old = current.current;
    clearSession();
    await room.disconnect(true);
    if (old)
      try {
        await voiceRequest("leave", { ticket: old.ticket }, true);
      } catch {
        setError(
          "You have disconnected. The server is finishing session cleanup; wait a moment before rejoining.",
        );
      }
  }
  async function join(
    channel: string,
    channelName: string,
    microphone: boolean,
  ) {
    if (joining.current || current.current) {
      setError("Leave your current room before joining another.");
      return;
    }
    joining.current = true;
    setBusy(true);
    setError("");
    const attempt = ++generation.current;
    let track: LocalAudioTrack | undefined;
    let credentials: VoiceCredentials | undefined;
    try {
      if (!navigator.mediaDevices?.getUserMedia)
        throw Error("Microphone access needs HTTPS and a supported browser.");
      if (microphone)
        track = await createLocalAudioTrack({
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        });
      if (attempt !== generation.current) return;
      credentials = await voiceRequest("token", { channel });
      if (attempt !== generation.current) return;
      const next = { ...credentials!, channel, name: channelName, channelName };
      current.current = next;
      setSession(next);
      await room.connect(credentials!.serverUrl, credentials!.token, {
        autoSubscribe: true,
      });
      if (attempt !== generation.current) {
        await room.disconnect(true);
        return;
      }
      if (track) {
        await room.localParticipant.publishTrack(track, {
          source: Track.Source.Microphone,
        });
        track = undefined;
      }
      // A click can still be subject to autoplay restrictions after async auth.
      await room.startAudio().catch(() => undefined);
      if(attempt===generation.current&&room.state===ConnectionState.Connected)setRecentChannels(old=>[channel,...old.filter(id=>id!==channel)].slice(0,8));
    } catch (e) {
      if (attempt === generation.current) {
        setError(
          e instanceof DOMException &&
            ["NotAllowedError", "PermissionDeniedError"].includes(e.name)
            ? "Microphone permission was denied. Allow it in your browser settings, or join muted."
            : e instanceof DOMException && e.name === "NotFoundError"
              ? "No microphone was found. Connect one or join muted."
              : e instanceof Error
                ? e.message
                : "Voice could not connect.",
        );
        clearSession();
        await room.disconnect(true);
      }
    } finally {
      track?.stop();
      if (
        credentials &&
        (attempt !== generation.current ||
          current.current?.ticket !== credentials.ticket)
      )
        voiceRequest("leave", { ticket: credentials.ticket }, true).catch(
          () => undefined,
        );
      joining.current = false;
      setBusy(false);
    }
  }
  async function toggleMic() {
    if (!session || busy || state !== ConnectionState.Connected) return;
    try {
      if (deafened) {
        setError("Undeafen before enabling your microphone.");
        return;
      }
      await localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled);
    } catch {
      setError(
        "Microphone access failed. Check browser permission and your selected device.",
      );
    }
  }
  async function toggleDeafen() {
    if (!session || busy || state !== ConnectionState.Connected) return;
    try {
      if (!deafened) {
        resumeMic.current = isMicrophoneEnabled;
        await localParticipant.setMicrophoneEnabled(false);
        setDeafened(true);
      } else {
        setDeafened(false);
        if (resumeMic.current)
          await localParticipant.setMicrophoneEnabled(true);
      }
    } catch {
      setError(
        "The audio setting could not be changed. Your microphone remains muted.",
      );
    }
  }
  useEffect(() => {
    const disconnected = () => {
      const old = current.current;
      current.current = null;
      setSession(null);
      setDeafened(false);
      if (old) {
        setError(
          "Voice disconnected. Your access may have changed, or the connection ended. Join again when ready.",
        );
        voiceRequest("leave", { ticket: old.ticket }, true).catch(
          () => undefined,
        );
      }
    };
    room.on(RoomEvent.Disconnected, disconnected);
    return () => {
      // This ref is an operation counter, not a DOM ref. Invalidate pending joins.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      generation.current++;
      const old = current.current;
      current.current = null;
      room.off(RoomEvent.Disconnected, disconnected);
      void room.disconnect(true);
      if (old)
        voiceRequest("leave", { ticket: old.ticket }, true).catch(
          () => undefined,
        );
    };
  }, [room]);
  useEffect(() => {
    if (!session) return;
    let active = true,
      failures = 0,
      running = false;
    const check = async () => {
      if (running) return;
      running = true;
      try {
        const result = await voiceRequest("session", {
          ticket: session.ticket,
        });
        if (!active) return;
        failures = 0;
        if (!result.allowed) {
          setError("Your voice access has ended.");
          current.current = null;
          setSession(null);
          await room.disconnect(true);
        }
      } catch {
        if (active && ++failures >= 3) {
          setError(
            "Voice access could not be verified. Please reconnect when services recover.",
          );
          current.current = null;
          setSession(null);
          await room.disconnect(true);
        }
      } finally {
        running = false;
      }
    };
    const timer = setInterval(() => void check(), 5000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [room, session]);
  return (
    <RoomContext.Provider value={room}>
      <Context.Provider
        value={{
          room,
          session,
          state,
          busy,
          error,
          deafened,
          muted: !isMicrophoneEnabled,
          participants,
          recentChannels,
          join,
          leave,
          toggleMic,
          toggleDeafen,
          setError,
        }}
      >
        {children}
        <RoomAudioRenderer room={room} muted={deafened} />
        {session && (
          <div className="voice-autoplay">
            <StartAudio
              room={room}
              label="Enable voice audio playback"
              className="button primary"
            />
          </div>
        )}
      </Context.Provider>
    </RoomContext.Provider>
  );
}
