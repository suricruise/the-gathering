import Link from 'next/link';
import {notFound} from 'next/navigation';
import {requireUser} from '@/src/lib/auth/session';
import {readCircle} from '@/src/lib/faith-circles/data';
import {CircleDetail} from '@/src/components/faith-circles/CircleDetail';
export const metadata={title:'Faith Circle',robots:{index:false,follow:false}};
export default async function CirclePage({params}:{params:Promise<{id:string}>}){const {id}=await params;await requireUser('/faith-circles');const r=await readCircle(id);if(r.denied)notFound();return r.data?<CircleDetail circle={r.data}/>:<div className="page"><h1>Circle services are unavailable</h1><p role="status">{r.error||'Please retry shortly.'}</p><Link className="button secondary" href="/faith-circles">Back to Faith Circles</Link></div>;}
