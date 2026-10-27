import{readConversationContext}from'@/src/lib/faith-circles/conversation';
import{CircleConversations}from'@/src/components/faith-circles/ConversationControls';
import{readStudyCards}from'@/src/lib/faith-circles/discovery';
import{StudyGrid}from'@/src/components/faith-circles/StudyLists';
import Link from 'next/link';
import {notFound} from 'next/navigation';
import {requireUser} from '@/src/lib/auth/session';
import {readCircle} from '@/src/lib/faith-circles/data';
import {CircleDetail} from '@/src/components/faith-circles/CircleDetail';
export const metadata={title:'Faith Circle',robots:{index:false,follow:false}};
export default async function CirclePage({params}:{params:Promise<{id:string}>}){const {id}=await params;await requireUser('/faith-circles');const r=await readCircle(id);if(r.denied)notFound();const conversation=r.data?.joined?await readConversationContext(id):null;const studies=r.data?await readStudyCards({mode:'explore',circle:id}):null;return r.data?<CircleDetail circle={r.data}>{conversation?.data&&<CircleConversations circle={id} initial={conversation.data}/>} {conversation?.error&&<p role="status">{conversation.error}</p>}<section className="faith-section padded" aria-label="Published Circle studies"><h2>Published studies</h2><StudyGrid key={JSON.stringify(studies)} initial={studies!} query={{mode:'explore',circle:id}} empty="No published studies are available to you in this Circle yet." progress={r.data.joined}/></section></CircleDetail>:<div className="page"><h1>Circle services are unavailable</h1><p role="status">{r.error||'Please retry shortly.'}</p><Link className="button secondary" href="/faith-circles">Back to Faith Circles</Link></div>;}
