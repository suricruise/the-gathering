import {requireUser} from '@/src/lib/auth/session';
import {HangoutsDashboard} from '@/src/components/hangouts/HangoutsDashboard';
export const dynamic='force-dynamic';
export default async function VoicePage(){await requireUser('/voice');return <HangoutsDashboard/>;}
