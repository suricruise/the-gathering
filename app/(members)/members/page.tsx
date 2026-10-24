import Link from "next/link";
import Form from "next/form";
import { joinedMemberCommunities } from "@/src/lib/communities/members";
import { MemberDirectory } from "@/src/components/people/MemberDirectory";
import { PageHeading, EmptyState } from "@/src/components/ui";
export const metadata={title:"Community members"};
export default async function MembersPage({searchParams}:{searchParams:Promise<{community?:string}>}){
 const data=await joinedMemberCommunities();const query=await searchParams;
 const communities=data.data||[];
 const chosen=communities.find(c=>c.id===query.community)||communities[0];
 return <div className="page"><PageHeading eyebrow="FIND YOUR PEOPLE" title="Community members" description="Meet the people in your communities. Send a request without hunting for their username." />
 {data.error?<EmptyState title="Members unavailable" description={data.error} />:chosen?<>
 <Form action="/members" className="member-picker"><label className="field">Community<select name="community" defaultValue={chosen.id}>{communities.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><button className="button secondary">Show members</button></Form>
 <MemberDirectory key={chosen.id} community={chosen.id}/>
 </>:<EmptyState title="Join a community to meet its members" description="Community member lists are visible to active members."><Link className="button primary" href="/communities">Browse communities</Link></EmptyState>}
 <p className="muted">Know someone’s username? <Link href="/messages?tab=discover">Find and add friends</Link>. Manage discovery and contact permissions in <Link href="/messages?tab=privacy">Privacy</Link>.</p>
 </div>;
}
