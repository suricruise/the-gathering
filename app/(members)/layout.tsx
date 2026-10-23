import { requireUser } from "@/src/lib/auth/session";
import { loadMyProfile } from "@/src/lib/profiles/data";
import { AppShell } from "@/src/components/AppShell";
import { MemberProvider } from "@/src/components/MemberContext";
import { VoiceProvider } from "@/src/components/voice/VoiceProvider";
export const dynamic = "force-dynamic";
export default async function MemberLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { client, user } = await requireUser();
  const { profile } = await loadMyProfile(client, user.id);
  return (
    <MemberProvider
      member={{
        id: user.id,
        name: profile.display_name || "New member",
        username: profile.username,
        avatar: !!profile.avatar_path,
        avatarVersion: profile.avatar_path,
      }}
    >
      <VoiceProvider>
        <AppShell>{children}</AppShell>
      </VoiceProvider>
    </MemberProvider>
  );
}
