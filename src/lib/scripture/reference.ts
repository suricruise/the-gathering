import books from './books.json';
export {books};
export type Passage={book:string;chapter:number;first:number|null;last:number|null};
const aliases:Record<string,string>={'psalm':'Psalms','ps':'Psalms','song of solomon':'Song of Songs','jn':'John','rev':'Revelation'};
export function formatReference(p:Passage){return `${p.book} ${p.chapter}${p.first!==null?`:${p.first}${p.last!==null?`-${p.last}`:''}`:''}`;}
export function parseReference(input:string):Passage|null{
 if(input.length>100)return null;const m=input.trim().replace(/\s+/g,' ').match(/^(.+?) ([1-9][0-9]{0,2})(?::([1-9][0-9]{0,2})(?:-([1-9][0-9]{0,2}))?)?$/);if(!m)return null;
 const name=aliases[m[1].toLowerCase()]??m[1],book=books.find(b=>b.name.toLowerCase()===name.toLowerCase()),chapter=Number(m[2]),first=m[3]?Number(m[3]):null,last=m[4]?Number(m[4]):null;
 if(!book||chapter>book.chapters||(first!==null&&first>176)||(last!==null&&(last>176||first===null||last<first)))return null;
 return{book:book.name,chapter,first,last};
}
export function adjacentChapter(p:Passage,step:-1|1):Passage|null{const i=books.findIndex(b=>b.name===p.book);if(i<0)return null;let book=i,chapter=p.chapter+step;if(chapter<1){book--;chapter=books[book]?.chapters;}else if(chapter>books[i].chapters){book++;chapter=1;}return books[book]?{book:books[book].name,chapter,first:null,last:null}:null;}
// Opens the provider's public reader only. No translation or deep-link API contract is assumed.
export const referenceSource={name:'YouVersion Bible reader',href:'https://www.bible.com/bible'}as const;
