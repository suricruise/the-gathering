import Link from "next/link";
import { memberContact } from "@/src/lib/people/rail";
import { requireUser } from "@/src/lib/auth/session";
import { MemberContactActions } from "@/src/components/people/MemberContactActions";
import { EmptyState, ProfileAvatar } from "@/src/components/ui";
export const metadata = { title: "Member profile", robots: { index: false, follow: false } };
export default async function MemberProfile({params}:{params:Promise<{id:string}>}) {
  const {id}=await params;
  const result=await memberContact(id);
  if(!result.data)return <div className="page"><EmptyState title="Member unavailable" description={result.error || "This member is no longer available."}/></div>;
  const person=result.data;
  const {client}=await requireUser();
  const visible=await client.rpc("visible_profile",{p_username:person.username});
  const profile=!visible.error?visible.data?.[0]:null;
  return <div className="page"><Link className="back-link" href="/members">← Community members</Link><section className="panel padded member-contact-profile">
    {person.avatar?<img className="member-avatar-image" src={`/api/avatars/${person.id}`} width={96} height={96} alt=""/>:<ProfileAvatar name={person.name} size="large"/>}
    <h1>{person.name}</h1><p className="muted">@{person.username}</p>
    <MemberContactActions key={person.id} initial={person}/>
    {profile?<><p className="body-copy">{profile.bio || "This member hasn’t added a bio yet."}</p><h2>Favorite games</h2><div className="tag-row">{profile.favorite_games.map((game:string)=><span className="pill" key={game}>{game}</span>)}</div><h2>Gaming platforms</h2><div className="tag-row">{profile.gaming_platforms.map((platform:string)=><span className="pill" key={platform}>{platform}</span>)}</div></>:<p className="muted">Profile details are private. You can still use the contact options this member permits.</p>}
  </section></div>;
}
