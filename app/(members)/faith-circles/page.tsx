import {requireUser} from '@/src/lib/auth/session';
import {readFaithHome} from '@/src/lib/faith-circles/data';
import {FaithCirclesHome} from '@/src/components/faith-circles/FaithCirclesHome';
export const metadata={title:'Faith Circles — Grow in the Word. Grow Together.'};
export default async function FaithCirclesPage(){await requireUser('/faith-circles');return <FaithCirclesHome result={await readFaithHome()}/>;}
