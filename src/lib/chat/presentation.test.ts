// @vitest-environment node
import {it,expect} from "vitest";
import {groupWithPrevious,messageDay,messageTime} from "./presentation";
import type {ChatMessage} from "./types";
const row={id:"one",author_id:"a",channel_id:"c",parent_id:null,created_at:"2026-10-24T12:00:00Z",deleted_at:null} as ChatMessage;
it("groups only consecutive same-author/scope messages within five minutes",()=>{expect(groupWithPrevious({...row,id:"two",created_at:"2026-10-24T12:04:00Z"},row,false)).toBe(true);for(const change of [{author_id:"b"},{parent_id:"thread"},{channel_id:"other"},{deleted_at:"deleted"},{author_id:null},{created_at:"2026-10-24T12:06:00Z"}])expect(groupWithPrevious({...row,...change},row,false)).toBe(false);});
it("never joins day boundaries, deleted predecessors or reversed timestamps",()=>{expect(groupWithPrevious({...row,created_at:"2026-10-25T00:01:00Z"},{...row,created_at:"2026-10-24T23:59:00Z"},false)).toBe(false);expect(groupWithPrevious(row,{...row,deleted_at:"deleted"},false)).toBe(false);expect(groupWithPrevious(row,{...row,created_at:"2026-10-24T12:01:00Z"},false)).toBe(false);});
it("provides stable UTC markup before hydration and viewer-local formatting afterward",()=>{expect(messageDay(row.created_at,false)).toBe("2026-10-24");expect(messageTime(row.created_at,false)).toBe(new Intl.DateTimeFormat("en-US",{hour:"numeric",minute:"2-digit",timeZone:"UTC"}).format(new Date(row.created_at)));expect(messageTime(row.created_at,true)).toBe(new Intl.DateTimeFormat(undefined,{hour:"numeric",minute:"2-digit"}).format(new Date(row.created_at)));});
