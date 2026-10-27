import Link from 'next/link';
import {notFound} from 'next/navigation';
import {requireUser} from '@/src/lib/auth/session';
import {readCirclePrayer,readPrayerComments} from '@/src/lib/faith-circles/conversation';
import {CirclePrayerDetail} from '@/src/components/faith-circles/CirclePrayers';
export const metadata={title:'Circle prayer',robots:{index:false,follow:false}};
export default async function Page({params}:{params:Promise<{id:string;prayerId:string}>}){const{id,prayerId}=await params;const{user}=await requireUser(`/faith-circles/${id}/prayers/${prayerId}`);const[p,comments]=await Promise.all([readCirclePrayer(id,prayerId),readPrayerComments({circle:id,view:'comments',resource:prayerId})]);if(p.denied||comments.denied)notFound();return <div className="page faith-circles-page"><Link href={`/faith-circles/${id}/prayers`}>← Circle prayer requests</Link>{p.data&&comments.data?<CirclePrayerDetail circle={id} userId={user.id} initial={p.data} comments={comments.data}/>:<><h1>Prayer unavailable</h1><p role="status">{p.error??comments.error}</p></>}</div>;}
