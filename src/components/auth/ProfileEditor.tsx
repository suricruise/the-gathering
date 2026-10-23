"use client";
import { useActionState, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Gamepad2,
  HeartHandshake,
  LoaderCircle,
  LockKeyhole,
  Upload,
} from "lucide-react";
import { saveProfile, uploadAvatar } from "../../lib/profiles/actions";
import type { ProfileBundle } from "../../lib/profiles/data";
import { interests } from "../../lib/auth/validation";
import { ProfileAvatar } from "../ui";
const labels: Record<string, string> = {
  casual: "Chill & casual",
  competitive: "Competitive",
  "co-op": "Co-op adventures",
  creative: "Building & creating",
  faith: "Faith & growth",
  conversation: "Real conversations",
  events: "Community events",
  streaming: "Streaming & sharing",
};
export function ProfileEditor({
  data,
  onboarding = false,
}: {
  data: ProfileBundle;
  onboarding?: boolean;
}) {
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState({
    displayName: data.profile.display_name,
    username: data.profile.username ?? "",
    bio: data.profile.bio,
    visibility: data.profile.visibility,
    games: data.games,
    platforms: data.platforms,
    interests: data.preferences.interests,
  });
  const toggle = (key: "games" | "platforms" | "interests", value: string) =>
    setDraft((previous) => ({
      ...previous,
      [key]: previous[key].includes(value)
        ? previous[key].filter((item) => item !== value)
        : [...previous[key], value],
    }));
  const [state, action, pending] = useActionState(saveProfile, {});
  const formRef = useRef<HTMLFormElement>(null);
  const headings = [
    "Make it yours.",
    "Find your kind of play.",
    "Room for your whole life.",
  ];
  const advance = () => {
    const section = formRef.current?.querySelector(`[data-step="${step}"]`);
    for (const input of section?.querySelectorAll<HTMLInputElement>(
      "input[required]",
    ) ?? [])
      if (!input.reportValidity()) return;
    setStep(step + 1);
  };
  return (
    <div className={onboarding ? "onboarding-editor" : "profile-editor"}>
      {onboarding && (
        <>
          <div
            className="onboarding-progress"
            aria-label={`Step ${step + 1} of 3`}
          >
            {["Your identity", "Your games", "Your people"].map(
              (label, index) => (
                <span key={label} className={index <= step ? "active" : ""}>
                  <i>{index < step ? <Check size={13} /> : index + 1}</i>
                  {label}
                </span>
              ),
            )}
          </div>
          <span className="eyebrow">A PLACE THAT FEELS LIKE YOU</span>
          <h1>{headings[step]}</h1>
          <p className="auth-description">
            {step === 0
              ? "Choose how you’ll show up in the gathering."
              : step === 1
                ? "From ranked matches to cozy nights, there’s a place for every kind of player."
                : "Tell us what brings you here. You can always change this later."}
          </p>
        </>
      )}
      <form ref={formRef} action={action}>
        <input
          type="hidden"
          name="complete"
          value={onboarding ? "yes" : "no"}
        />
        <section data-step="0" hidden={onboarding && step !== 0}>
          <div className="profile-fields">
            <label className="field">
              Display name
              <input
                name="displayName"
                value={draft.displayName}
                onChange={(event) =>
                  setDraft({ ...draft, displayName: event.target.value })
                }
                minLength={1}
                maxLength={60}
                required
                autoComplete="nickname"
                placeholder="What should we call you?"
              />
            </label>
            <label className="field">
              Username
              <span className="username-input">
                <span>@</span>
                <input
                  name="username"
                  value={draft.username}
                  onChange={(event) =>
                    setDraft({ ...draft, username: event.target.value })
                  }
                  minLength={3}
                  maxLength={24}
                  pattern="[a-z][a-z0-9_]{2,23}"
                  autoComplete="username"
                  required
                  placeholder="your_gamer_handle"
                />
              </span>
              <small>
                3–24 lowercase letters, numbers, or underscores. Start with a
                letter. Your choice is validated when you save; we never publish
                an availability search.
              </small>
            </label>
          </div>
          <label className="field">
            A little about you
            <textarea
              name="bio"
              value={draft.bio}
              onChange={(event) =>
                setDraft({ ...draft, bio: event.target.value })
              }
              maxLength={500}
              rows={3}
              placeholder="Favorite worlds, little joys, what you’re here for…"
            />
          </label>
          <fieldset className="privacy-options">
            <legend>
              <LockKeyhole size={16} />
              Who can see your profile?
            </legend>
            {[
              {
                value: "private",
                label: "Just me",
                description: "Your profile and avatar stay private.",
              },
              {
                value: "members",
                label: "Gathering members",
                description: "Only signed-in members can view your profile.",
              },
              {
                value: "public",
                label: "Anyone with the link",
                description:
                  "Share your name, bio, avatar, games, and platforms publicly.",
              },
            ].map((option) => (
              <label key={option.value}>
                <input
                  type="radio"
                  name="visibility"
                  value={option.value}
                  checked={draft.visibility === option.value}
                  onChange={() =>
                    setDraft({
                      ...draft,
                      visibility: option.value as typeof draft.visibility,
                    })
                  }
                />
                <span>
                  <strong>{option.label}</strong>
                  <small>{option.description}</small>
                </span>
              </label>
            ))}
          </fieldset>
        </section>
        <section data-step="1" hidden={onboarding && step !== 1}>
          <fieldset className="selection-fieldset">
            <legend>
              <Gamepad2 size={19} />
              Your favorite games
            </legend>
            <p>Pick at least one for onboarding. Up to 12 favorites.</p>
            <div className="selection-grid">
              {data.gameCatalog.map((game) => (
                <label key={game.id} className="selection-card">
                  <input
                    type="checkbox"
                    aria-label={game.name}
                    name="games"
                    value={game.id}
                    checked={draft.games.includes(game.id)}
                    onChange={() => toggle("games", game.id)}
                  />
                  <span>
                    <Gamepad2 size={19} />
                    {game.name}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className="selection-fieldset">
            <legend>Where do you play?</legend>
            <p>Pick at least one gaming platform.</p>
            <div className="selection-grid platforms-grid">
              {data.platformCatalog.map((platform) => (
                <label key={platform.id} className="selection-card">
                  <input
                    type="checkbox"
                    aria-label={platform.name}
                    name="platforms"
                    value={platform.id}
                    checked={draft.platforms.includes(platform.id)}
                    onChange={() => toggle("platforms", platform.id)}
                  />
                  <span>{platform.name}</span>
                </label>
              ))}
            </div>
          </fieldset>
        </section>
        <section data-step="2" hidden={onboarding && step !== 2}>
          <fieldset className="selection-fieldset">
            <legend>
              <HeartHandshake size={19} />
              What brings you here?
            </legend>
            <p>
              Pick at least one interest for onboarding. There’s room for all of
              you.
            </p>
            <div className="selection-grid">
              {interests.map((interest) => (
                <label key={interest} className="selection-card">
                  <input
                    type="checkbox"
                    aria-label={labels[interest]}
                    name="interests"
                    value={interest}
                    checked={draft.interests.includes(interest)}
                    onChange={() => toggle("interests", interest)}
                  />
                  <span>{labels[interest]}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="privacy-reminder">
            <LockKeyhole size={19} />
            <p>
              Privacy is your choice. Your email and birth date are never
              included in community profiles. Your interest selections stay
              private to your account.
            </p>
          </div>
        </section>
        {state.error && (
          <p role="alert" className="form-error">
            {state.error}
            {onboarding && step !== 0 && (
              <button
                type="button"
                className="text-link"
                onClick={() => setStep(0)}
              >
                Review your profile details
              </button>
            )}
          </p>
        )}
        {state.notice && (
          <p role="status" className="form-notice">
            {state.notice}
          </p>
        )}
        <div className="editor-actions">
          {onboarding && step > 0 && (
            <button
              type="button"
              className="button secondary"
              onClick={() => setStep(step - 1)}
            >
              <ArrowLeft size={16} />
              Back
            </button>
          )}
          {onboarding && step < 2 ? (
            <button
              key="continue"
              type="button"
              className="button primary"
              onClick={(event) => {
                event.preventDefault();
                advance();
              }}
            >
              Continue
              <ArrowRight size={17} />
            </button>
          ) : (
            <button
              key="submit"
              type="submit"
              className="button primary"
              disabled={pending}
            >
              {pending ? (
                <LoaderCircle className="spin" size={17} />
              ) : (
                <Check size={17} />
              )}{" "}
              {onboarding ? "Find my gathering" : "Save profile"}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
export function AvatarEditor({
  name,
  hasAvatar,
  id,
  version,
}: {
  name: string;
  hasAvatar: boolean;
  id: string;
  version: string | null;
}) {
  const [state, action, pending] = useActionState(uploadAvatar, {});
  return (
    <section className="panel avatar-editor">
      <div>
        {hasAvatar ? (
          <img
            className="member-avatar-image"
            src={`/api/avatars/${id}?v=${encodeURIComponent(version ?? "")}`}
            alt={`${name} avatar`}
            width={80}
            height={80}
          />
        ) : (
          <ProfileAvatar name={name} size="large" />
        )}
        <div>
          <h2>Your face in the gathering</h2>
          <p>
            PNG, JPEG, or WebP · up to 2 MB
            <br />
            Your profile visibility also controls your avatar.
          </p>
        </div>
      </div>
      <form action={action}>
        <label className="field">
          Choose an avatar
          <input
            type="file"
            name="avatar"
            accept="image/png,image/jpeg,image/webp"
            required
          />
        </label>
        <button type="submit" className="button secondary" disabled={pending}>
          <Upload size={16} />
          {pending ? "Uploading…" : "Upload avatar"}
        </button>
        {state.error && (
          <p role="alert" className="form-error">
            {state.error}
          </p>
        )}
        {state.notice && (
          <p role="status" className="form-notice">
            {state.notice}
          </p>
        )}
      </form>
    </section>
  );
}
