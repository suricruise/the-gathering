import{readBuilderStudies}from'@/src/lib/faith-circles/builder';
import{readStudyHangouts,readHangoutOptions}from'@/src/lib/faith-circles/hangouts';
import{StudyHangoutList}from'@/src/components/faith-circles/StudyHangouts';
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
export default async function CirclePage({params}:{params:Promise<{id:string}>}){const {id}=await params;await requireUser('/faith-circles');const r=await readCircle(id);if(r.denied)notFound();const [hangouts,hosting]=r.data?.joined?await Promise.all([readStudyHangouts({view:'index',circle:id}),readHangoutOptions({view:'studies',circle:id,size:1})]):[null,null];const builder=r.data?.joined?await readBuilderStudies({circle:id,size:1}):null;const conversation=r.data?.joined?await readConversationContext(id):null;const studies=r.data?await readStudyCards({mode:'explore',circle:id}):null;return r.data?<CircleDetail circle={r.data}>{r.data.joined&&<Link className="button secondary" href={`/faith-circles/scripture?circle=${id}`}>Read Scripture references</Link>}{builder?.data&&<Link className="button secondary" href={`/faith-circles/${id}/builder`}>Bible Study Builder</Link>}{hangouts&&<StudyHangoutList circle={id} initial={hangouts} canHost={!!hosting?.data}/>}{conversation?.data&&<CircleConversations circle={id} initial={conversation.data}/>} {conversation?.error&&<p role="status">{conversation.error}</p>}<section className="faith-section padded" aria-label="Published Circle studies"><h2>Published studies</h2><StudyGrid key={JSON.stringify(studies)} initial={studies!} query={{mode:'explore',circle:id}} empty="No published studies are available to you in this Circle yet." progress={r.data.joined}/></section></CircleDetail>:<div className="page"><h1>Circle services are unavailable</h1><p role="status">{r.error||'Please retry shortly.'}</p><Link className="button secondary" href="/faith-circles">Back to Faith Circles</Link></div>;}
