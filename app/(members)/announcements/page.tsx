import {requireUser} from '@/src/lib/auth/session';
import {memberAnnouncements} from '@/src/lib/admin/actions';
import {PageHeading,EmptyState} from '@/src/components/ui';
export default async function AnnouncementsPage(){
 await requireUser('/announcements');const result=await memberAnnouncements();
 return <div className="page"><PageHeading eyebrow="AROUND THE GATHERING" title="Announcements" description="Updates shared by your community hosts."/>{result.error?<EmptyState title="Announcements unavailable" description={result.error}/>:result.data?.length?result.data.map(a=><article className="panel padded community-section" key={a.id}><h2>{a.title}</h2><p className="admin-wrap">{a.body}</p></article>):<EmptyState title="No announcements yet" description="Published updates for your communities will appear here."/>}</div>;
}
