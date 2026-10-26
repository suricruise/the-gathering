import type {Community} from '../communities/data';
export const interestCategories = [
 ['conversation','Conversation'],['gaming','Gaming'],['movies-tv','Movies & TV'],['music','Music'],['books-comics','Books & Comics'],['creativity','Creativity'],['technology','Technology'],['sports','Sports'],['faith-life','Faith & Life'],['lifestyle','Lifestyle'],
] as const;
export type Interest = typeof interestCategories[number][0];
export type DiscoveryStats={id:string;category:Interest|null;created_at:string;members:number;online:number|null;activity:number;unread:boolean|null};
export type DiscoveryCommunity=Community & {stats?:DiscoveryStats};
export function categoryLabel(category?:string|null){return interestCategories.find(([id])=>id===category)?.[1]??'Uncategorized';}
export function rankPopular(communities:DiscoveryCommunity[]){return communities.filter(c=>c.stats&&c.stats.activity>0&&c.visibility!=='private').sort((a,b)=>b.stats!.activity-a.stats!.activity||(a.display_order??1000)-(b.display_order??1000)||a.name.localeCompare(b.name)||a.id.localeCompare(b.id)).slice(0,4);}
export function recentPublic(communities:DiscoveryCommunity[]){return communities.filter(c=>c.visibility==='public'&&c.stats?.created_at).sort((a,b)=>b.stats!.created_at.localeCompare(a.stats!.created_at)||a.id.localeCompare(b.id)).slice(0,6);}
export function filterCommunities(communities:DiscoveryCommunity[],query:string,category:string,joined:Set<string>,onlyJoined:boolean){return communities.filter(c=>(!onlyJoined||joined.has(c.id))&&(category==='all'||c.stats?.category===category)&&`${c.name} ${c.description}`.toLowerCase().includes(query.trim().toLowerCase()));}
