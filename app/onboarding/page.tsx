import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/src/lib/auth/session";
import { loadMyProfile } from "@/src/lib/profiles/data";
import { ProfileEditor } from "@/src/components/auth/ProfileEditor";
import { Brand } from "@/src/components/ui";
import { logout } from "@/src/lib/auth/actions";
export const metadata = { title: "Make yourself at home" };
export const dynamic = "force-dynamic";
export default async function OnboardingPage() {
  const { client, user } = await requireUser("/onboarding");
  const data = await loadMyProfile(client, user.id);
  if (data.profile.onboarding_completed_at) redirect("/home");
  return (
    <div className="onboarding-page">
      <header className="auth-header">
        <Brand />
        <form action={logout}>
          <button className="button secondary">Sign out</button>
        </form>
      </header>
      <main className="onboarding-card">
        <ProfileEditor data={data} onboarding />
      </main>
      <footer className="onboarding-footer">
        Not ready to finish? <Link href="/settings">Manage your account</Link>
      </footer>
    </div>
  );
}
