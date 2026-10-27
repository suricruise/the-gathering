import Link from 'next/link';
import {requireUser} from '@/src/lib/auth/session';
import {readDiscoveryHome} from '@/src/lib/faith-circles/discovery';
import {topicSchema} from '@/src/lib/faith-circles/discovery-types';
import {FaithCirclesHome} from '@/src/components/faith-circles/FaithCirclesHome';
export const metadata={title:'Faith Circles — Grow in the Word. Grow Together.'};
export default async function FaithCirclesPage({searchParams}:{searchParams:Promise<{topic?:string}>}){await requireUser('/faith-circles');const query=await searchParams;const p=topicSchema.nullable().safeParse(query.topic??null);return <><div className="page study-builder-entry"><Link className="button secondary" href="/faith-circles/builder">Leader Study Builder</Link><Link className="button secondary" href="/faith-circles/scripture">Scripture reader</Link></div><FaithCirclesHome topic={p.success?p.data:null} result={await readDiscoveryHome(query.topic)}/></>;}
