import Link from 'next/link';
import {notFound} from 'next/navigation';
import {requireUser} from '@/src/lib/auth/session';
import {readCircle} from '@/src/lib/faith-circles/data';
import {readCirclePrayers,readConversationContext} from '@/src/lib/faith-circles/conversation';
import {CirclePrayerList} from '@/src/components/faith-circles/CirclePrayers';
export const metadata={title:'Circle prayer & praise',robots:{index:false,follow:false}};
export default async function Page({params}:{params:Promise<{id:string}>}){const{id}=await params;await requireUser(`/faith-circles/${id}/prayers`);const c=await readCircle(id);if(c.denied||!c.data?.joined)notFound();const[p,context]=await Promise.all([readCirclePrayers({circle:id,view:'prayers'}),readConversationContext(id)]);if(p.denied||context.denied)notFound();return <div className="page faith-circles-page"><Link href={`/faith-circles/${id}`}>← {c.data.name}</Link><h1>Prayer &amp; praise</h1>{p.data&&context.data?<CirclePrayerList circle={id} initial={p.data} context={context.data}/>:<p role="status">{p.error??context.error??'Circle prayer services are unavailable. Please retry.'}</p>}</div>;}
