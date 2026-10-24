import type { ChatMessage } from "./types";
export function messageDay(value:string,local:boolean) {
 const d=new Date(value);
 return local?`${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`:d.toISOString().slice(0,10);
}
export function groupWithPrevious(message:ChatMessage,previous:ChatMessage|undefined,local:boolean){
 if(!previous||!message.author_id||message.author_id!==previous.author_id||message.deleted_at||previous.deleted_at||message.parent_id!==previous.parent_id||message.channel_id!==previous.channel_id)return false;
 const gap=Date.parse(message.created_at)-Date.parse(previous.created_at);
 return gap>=0&&gap<=5*60*1000&&messageDay(message.created_at,local)===messageDay(previous.created_at,local);
}
export function messageTime(value:string,local:boolean){return new Intl.DateTimeFormat(local?undefined:"en-US",{hour:"numeric",minute:"2-digit",timeZone:local?undefined:"UTC"}).format(new Date(value));}
export function messageDateLabel(value:string,local:boolean){return new Intl.DateTimeFormat(local?undefined:"en-US",{dateStyle:"full",timeZone:local?undefined:"UTC"}).format(new Date(value));}
