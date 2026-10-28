"use client";
import { ProfileAvatar } from "./ui";
import { createContext, useContext, type ReactNode } from "react";
export type MemberIdentity = {
  id: string;
  name: string;
  username: string | null;
  avatar: boolean;
  avatarVersion?: string | null;
  coverVersion?: string | null;
};
const Context = createContext<MemberIdentity | null>(null);
export function MemberProvider({
  member,
  children,
}: {
  member: MemberIdentity;
  children: ReactNode;
}) {
  return <Context.Provider value={member}>{children}</Context.Provider>;
}
// The fallback is used only by isolated Phase 2 component tests.
export function useMember() {
  return useContext(Context);
}

export function MemberAvatar({ size = "" }: { size?: "small" | "" }) {
  const member = useMember();
  if (member?.avatar)
    return (
      <img
        className={`member-shell-avatar ${size}`}
        src={`/api/avatars/${member.id}?v=${encodeURIComponent(member.avatarVersion ?? "")}`}
        alt={member.name}
        width={size === "small" ? 30 : 36}
        height={size === "small" ? 30 : 36}
      />
    );
  return <ProfileAvatar name={member?.name || "Member"} size={size} />;
}
