"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowUpRight,
  Mic,
  MicOff,
  Headphones,
  PhoneOff,
  VolumeX,
} from "lucide-react";
import {
  useMediaDeviceSelect,
  useConnectionQualityIndicator,
  useIsSpeaking,
  useParticipantInfo,
  useTrackMutedIndicator,
  useParticipantTracks,
} from "@livekit/components-react";
import { ConnectionState, Track, type Participant } from "livekit-client";
import {communityMembers,type DirectoryMember} from "../../lib/communities/members";
import { useVoice, voiceRequest } from "./VoiceProvider";
export function voiceStateLabel(state: ConnectionState) {
  return (
    (
      {
        connected: "Voice connected",
        connecting: "Voice connecting",
        reconnecting: "Voice reconnecting",
        signalReconnecting: "Voice reconnecting",
        disconnected: "Voice disconnected",
      } as Record<string, string>
    )[state] || "Voice disconnected"
  );
}
export function PersistentVoiceBar({ mobile = false }: { mobile?: boolean }) {
  const v = useVoice();
  return (
    <div
      className={mobile ? "mobile-voice-status" : "voice-connection"}
      aria-label="Voice connection status"
    >
      <Headphones size={17} />
      <div>
        <strong role="status">
          {v?.session
            ? voiceStateLabel(v.state)
            : v?.busy
              ? "Voice connecting"
              : "Voice disconnected"}
        </strong>
        {v?.session && <small>{v.session.channelName}</small>}
      </div>
      <Link
        href={v?.session?.destination ?? "/voice"}
        className="icon-button"
        aria-label={
          v?.session?.destination?.startsWith("/squad-up/")
            ? "Open squad voice room"
            : "Open voice lounge"
        }
      >
        <ArrowUpRight size={16} />
      </Link>
      {v?.session && (
        <>
          <button
            className="icon-button"
            disabled={v.busy || v.state !== ConnectionState.Connected}
            onClick={() => void v.toggleMic()}
            aria-label={v.muted ? "Unmute microphone" : "Mute microphone"}
            aria-pressed={v.muted}
          >
            {v.muted ? <MicOff size={17} /> : <Mic size={17} />}
          </button>
          <button className="icon-button" disabled={v.busy} onClick={()=>void v.toggleDeafen()} aria-label={v.deafened?"Undeafen audio":"Deafen audio"} aria-pressed={v.deafened}>{v.deafened?<VolumeX size={17}/>:<Headphones size={17}/>}</button>
          <button
            className="icon-button"
            onClick={() => void v.leave()}
            aria-label="Leave voice room"
          >
            <PhoneOff size={17} />
          </button>
        </>
      )}
    </div>
  );
}
function DeviceSelect({
  kind,
  label,
}: {
  kind: MediaDeviceKind;
  label: string;
}) {
  const v = useVoice()!;
  const { setError } = v;
  const deviceError = useCallback(
    () => setError("Device selection is unavailable in this browser."),
    [setError],
  );
  const { devices, activeDeviceId, setActiveMediaDevice } =
    useMediaDeviceSelect({
      kind,
      room: v.room,
      requestPermissions: false,
      onError: deviceError,
    });
  return (
    <label className="field">
      {label}
      <select
        value={activeDeviceId || ""}
        onChange={(e) =>
          void setActiveMediaDevice(e.target.value).catch(() =>
            v.setError("That audio device could not be selected."),
          )
        }
      >
        <option value="">System default</option>
        {devices.map((d, i) => (
          <option key={d.deviceId || i} value={d.deviceId}>
            {d.label || `${label} ${i + 1}`}
          </option>
        ))}
      </select>
    </label>
  );
}
function ParticipantRow({
  participant,
  canModerate,
  channel,
  profile,
}: {
  profile?:DirectoryMember;
  participant: Participant;
  canModerate: boolean;
  channel: string;
}) {
  const v = useVoice()!,
    speaking = useIsSpeaking(participant),
    { name, identity } = useParticipantInfo({ participant }),
    { quality } = useConnectionQualityIndicator({ participant });
  const tracks = useParticipantTracks([Track.Source.Microphone], {
    participantIdentity: participant.identity,
    room: v.room,
  });
  const { isMuted: publicationMuted } = useTrackMutedIndicator(
    tracks[0] ?? { participant, source: Track.Source.Microphone },
  );
  const isMuted = !tracks.length || publicationMuted;
  const [pending, setPending] = useState(false),[avatarFailed,setAvatarFailed]=useState(false);
  async function remove() {
    if (
      !window.confirm(
        `Remove ${name || "this member"} from voice for 15 minutes?`,
      )
    )
      return;
    setPending(true);
    try {
      await voiceRequest("control", {
        channel,
        operation: "remove",
        target: identity,
      });
    } catch (e) {
      v.setError(e instanceof Error ? e.message : "Removal failed.");
    } finally {
      setPending(false);
    }
  }
  return (
    <li
      className={`voice-participant ${speaking ? "is-speaking" : ""}`}
      data-participant-id={identity}
    >
      <span className="voice-avatar" aria-hidden="true">
        {profile?.avatar&&!avatarFailed?<img src={`/api/avatars/${identity}`} alt="" width={64} height={64} onError={()=>setAvatarFailed(true)}/>:<span>{(name || "Member").slice(0, 2).toUpperCase()}</span>}
      </span>
      <div>
        <strong>
          {name || "Member"}
          {participant.isLocal ? " (you)" : ""}
        </strong>
        {profile?.role&&<span className="voice-participant-role">{profile.role}</span>}
        <small>
          {speaking ? "Speaking" : isMuted ? "Microphone muted" : "Listening"} ·
          Connection: {quality}
        </small>
      </div>
      {isMuted ? (
        <MicOff size={16} aria-label="Microphone muted" />
      ) : (
        <Mic size={16} aria-label="Microphone enabled" />
      )}
      {profile?.profile_visible&&<Link className="text-link voice-profile-link" href={`/members/${identity}`}>View profile</Link>}
      {canModerate && !participant.isLocal && (
        <button
          className="button secondary"
          disabled={pending}
          onClick={() => void remove()}
        >
          {pending ? "Removing…" : "Remove"}
        </button>
      )}
    </li>
  );
}
export function VoiceRoomPanel({
  channel,
  name,
  description,
  role,
  limit = 12,
  locked = false,
  configured = true,
}: {
  channel: string;
  name: string;
  description?: string;
  role?: string | null;
  limit?: number;
  locked?: boolean;
  configured?: boolean;
}) {
  const v = useVoice();
  const [settingsBusy, setSettingsBusy] = useState(false),
    [newLimit, setNewLimit] = useState(limit),
    [newLocked, setNewLocked] = useState(locked),
    [notice, setNotice] = useState("");
  const [people,setPeople]=useState<DirectoryMember[]>([]);
  const connectedHere=v?.session?.channel===channel;
  useEffect(()=>{if(!connectedHere){setPeople([]);return;}let live=true;const load=()=>{void communityMembers({channel,size:50}).then(r=>{if(live)setPeople(r.data?.items??[]);}).catch(()=>{if(live)setPeople([]);});};load();const timer=setInterval(()=>{if(document.visibilityState==='visible'&&navigator.onLine)load();},30000);return()=>{live=false;clearInterval(timer);};},[channel,connectedHere]);
  if (!v) return <p>Voice is available after signing in.</p>;
  const current = v.session?.channel === channel,
    canModerate = ["owner", "administrator", "moderator"].includes(role || ""),
    canSettings = ["owner", "administrator"].includes(role || "");
  async function settings() {
    if (
      !window.confirm(
        "Apply room settings? Connected participants will be disconnected and must rejoin.",
      )
    )
      return;
    setSettingsBusy(true);
    try {
      await voiceRequest("control", {
        channel,
        operation: "settings",
        limit: newLimit,
        locked: newLocked,
      });
      setNotice("Room settings saved. Existing connections have been closed.");
    } catch (e) {
      v!.setError(e instanceof Error ? e.message : "Settings failed.");
    } finally {
      setSettingsBusy(false);
    }
  }
  return (
    <section
      className="voice-room-panel panel padded"
      aria-label={`${name} voice room`}
    >
      <p className="eyebrow">YOUR COMMUNITY HANGOUT</p>
      <div className="section-heading">
        <h2>{name}</h2>
        <span className="pill">{locked ? "Locked" : `${limit} places`}</span>
      </div>
      {description && <p>{description}</p>}
      <p className="voice-privacy">
        Live microphone audio via LiveKit. Recording is off. Use headphones to
        avoid echo.
      </p>
      {!configured && (
        <p role="status">
          Voice infrastructure is not configured yet. The administrator must
          connect LiveKit and start the enforcement worker.
        </p>
      )}
      {v.error && (
        <p className="form-error" role="alert">
          {v.error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {current ? (
        <>
          <p className="voice-live-state" role="status">
            {voiceStateLabel(v.state)}
          </p>
          <div className="voice-actions">
            <button
              className="button secondary"
              disabled={v.busy || v.state !== ConnectionState.Connected}
              onClick={() => void v.toggleMic()}
              aria-pressed={v.muted}
            >
              {v.muted ? <MicOff size={17} /> : <Mic size={17} />}{" "}
              {v.muted ? "Unmute microphone" : "Mute microphone"}
            </button>
            <button
              className="button secondary"
              disabled={v.busy || v.state !== ConnectionState.Connected}
              onClick={() => void v.toggleDeafen()}
              aria-pressed={v.deafened}
            >
              {v.deafened ? <VolumeX size={17} /> : <Headphones size={17} />}{" "}
              {v.deafened ? "Undeafen" : "Deafen"}
            </button>
            <button className="button secondary" onClick={() => void v.leave()}>
              <PhoneOff size={17} /> Leave room
            </button>
          </div>
          <div className="voice-devices">
            <DeviceSelect kind="audioinput" label="Microphone" />
            <DeviceSelect kind="audiooutput" label="Speaker or headphones" />
          </div>
          <small>
            Output selection depends on browser support. On mobile, use your
            system audio controls if no output devices are listed.
          </small>
          <h3>{v.state===ConnectionState.Connected?"Connected participants":"Room participants"} ({v.participants.length})</h3>
          <ul className="voice-participants">
            {v.participants.map((p) => (
              <ParticipantRow
                key={p.identity}
                participant={p}
                channel={channel}
                canModerate={canModerate}
                profile={people.find(person=>person.id===p.identity)}
              />
            ))}
          </ul>
        </>
      ) : (
        <div className="voice-actions">
          <button
            className="button primary"
            disabled={!configured || locked || v.busy || !!v.session}
            onClick={() => void v.join(channel, name, true)}
          >
            {v.busy ? "Connecting…" : "Join with microphone"}
          </button>
          <button
            className="button secondary"
            disabled={!configured || locked || v.busy || !!v.session}
            onClick={() => void v.join(channel, name, false)}
          >
            Join muted
          </button>
          {(v.session || v.busy) && (
            <button className="button secondary" onClick={() => void v.leave()}>
              {v.busy ? "Cancel connection" : "Leave current room"}
            </button>
          )}
        </div>
      )}
      {canSettings && (
        <details className="voice-settings">
          <summary>Room controls</summary>
          <label className="field">
            Participant limit
            <input
              type="number"
              min={2}
              max={50}
              value={newLimit}
              onChange={(e) => setNewLimit(Number(e.target.value))}
            />
          </label>
          <label>
            <input
              type="checkbox"
              checked={newLocked}
              onChange={(e) => setNewLocked(e.target.checked)}
            />{" "}
            Lock room to prevent joining
          </label>
          <p>
            Applying settings disconnects everyone. Removal suspends a member
            from this room for 15 minutes; community bans also revoke voice
            access.
          </p>
          <button
            className="button secondary"
            disabled={
              settingsBusy ||
              !Number.isInteger(newLimit) ||
              newLimit < 2 ||
              newLimit > 50
            }
            onClick={() => void settings()}
          >
            {settingsBusy ? "Saving…" : "Apply room settings"}
          </button>
        </details>
      )}
    </section>
  );
}
