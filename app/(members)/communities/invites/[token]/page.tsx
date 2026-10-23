import { notFound } from "next/navigation";
import { requireUser } from "@/src/lib/auth/session";
import { CommandForm } from "@/src/components/communities/CommunityForms";
export const metadata = {
  title: "Community invitation · The Gathering",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!/^[a-f0-9]{64}$/.test(token)) notFound();
  await requireUser(`/communities/invites/${token}`);
  return (
    <div className="page">
      <section className="panel padded">
        <h1>You’re invited.</h1>
        <p className="body-copy">
          Accept to join this community as a member. Invitations are single-use
          and expire after 7 days. Community details become available after you
          join.
        </p>
        <CommandForm operation="accept_invite" label="Accept invitation">
          <input type="hidden" name="token" value={token} />
        </CommandForm>
      </section>
    </div>
  );
}
