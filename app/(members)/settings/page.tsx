import Link from "next/link";
import { requireUser } from "@/src/lib/auth/session";
import { loadMyProfile } from "@/src/lib/profiles/data";
import { PageHeading } from "@/src/components/ui";
import { AccountSettings } from "@/src/components/auth/AccountSettings";
export const metadata = { title: "Account settings" };
export default async function SettingsPage() {
  const { client, user } = await requireUser("/settings");
  const data = await loadMyProfile(client, user.id);
  return (
    <div className="page narrow-page">
      <PageHeading
        eyebrow="YOUR SPACE. YOUR CHOICE."
        title="Your account settings"
        description="Control your preferences, security, and account."
      />
      <section className="panel padded"><h2>The Gathering on your device</h2><p>Install the app on your phone or computer using your existing account.</p><Link className="button secondary" href="/install">Install The Gathering</Link></section>
      <AccountSettings
        email={user.email!}
        eventReminders={data.preferences.event_reminders}
        showActivity={data.preferences.show_gaming_activity}
      />
    </div>
  );
}
