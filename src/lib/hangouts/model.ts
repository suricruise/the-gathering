export const hangoutTypes=['Casual Conversation','Gaming Together','Watch & Discuss','Creative Hangout','Faith & Life','Community Meetup'] as const;
export type HangoutType=typeof hangoutTypes[number];
export type HangoutPerson={id:string;name:string;avatar:boolean};
export type HangoutRoom={id:string;name:string;description:string;community:{id:string;name:string;slug:string;image:string|null};type:HangoutType|null;isPrivate:boolean;canJoin:boolean;locked:boolean;limit:number|null;count:number|null;participants:HangoutPerson[];suggested:boolean};
export type HangoutData={rooms:HangoutRoom[];observedAt:string;mediaAvailable:boolean;warning?:string};
export function roomType(category:string|null|undefined):HangoutType|null{return hangoutTypes.find(type=>type.toLowerCase()===category?.trim().toLowerCase())??null;}
export function suggestedRooms(rooms:HangoutRoom[],current?:string){return rooms.filter(r=>r.count!==null&&r.count>0&&r.canJoin&&!r.locked&&r.id!==current).sort((a,b)=>Number(b.suggested)-Number(a.suggested)||(b.count??0)-(a.count??0)||a.name.localeCompare(b.name)||a.id.localeCompare(b.id)).slice(0,4);}
export function recentRooms(rooms:HangoutRoom[],recent:string[]){const map=new Map(rooms.map(r=>[r.id,r]));return recent.flatMap(id=>map.has(id)?[map.get(id)!]:[]).slice(0,8);}
export function matchesInterest(type:HangoutType|null,interests:string[]){const keys:Partial<Record<HangoutType,string[]>>={'Casual Conversation':['conversation'],'Gaming Together':['casual','competitive','co-op'],'Watch & Discuss':['conversation','streaming'],'Creative Hangout':['creative'],'Faith & Life':['faith'],'Community Meetup':['events']};return !!type&&!!keys[type]?.some(i=>interests.includes(i));}
