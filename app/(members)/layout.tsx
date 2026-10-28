import { requireUser } from "@/src/lib/auth/session";
import { loadMemberIdentity } from "@/src/lib/profiles/data";
import { AppShell } from "@/src/components/AppShell";
import { MemberProvider } from "@/src/components/MemberContext";
import { VoiceProvider } from "@/src/components/voice/VoiceProvider";
import { PeopleProvider } from "@/src/components/people/PeopleProvider";
import { publicConfig } from "@/src/lib/config";
export const dynamic = "force-dynamic";
export default async function MemberLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { client, user } = await requireUser();
  const profile = await loadMemberIdentity(client, user.id);
  return (
    <MemberProvider
      member={{
        id: user.id,
        name: profile.display_name || "New member",
        username: profile.username,
        avatar: !!profile.avatar_path,
        avatarVersion: profile.avatar_path,
        coverVersion: profile.coverVersion,
      }}
    >
      <VoiceProvider>
        <PeopleProvider config={publicConfig()!}>
          <AppShell>{children}</AppShell>
        </PeopleProvider>
      </VoiceProvider>
    </MemberProvider>
  );
}
