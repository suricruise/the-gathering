// @vitest-environment node
import { beforeEach, it, expect, vi } from "vitest";
const m=vi.hoisted(()=>({user:vi.fn(),rpc:vi.fn()}));
vi.mock("server-only",()=>({}));
vi.mock("../supabase/server",()=>({createClient:async()=>({auth:{getUser:m.user},rpc:m.rpc})}));
import { onlineMembers, memberContact, communityPresence } from "./rail";
const id="a4000000-0000-4000-8000-000000000001";
beforeEach(()=>{vi.resetAllMocks();m.user.mockResolvedValue({data:{user:{id,email_confirmed_at:"verified"}},error:null});m.rpc.mockResolvedValue({data:{items:[]},error:null});});
it("rejects arbitrary identities, bad scope and nonboolean privacy before Auth",async()=>{expect((await onlineMembers({channel:id,actor:id})).error).toBeTruthy();expect((await memberContact("bad")).denied).toBe(true);expect((await communityPresence({user:id,share:true})).error).toBeTruthy();expect(m.user).not.toHaveBeenCalled();});
it("requires independently verified Auth for lists, profiles and preferences",async()=>{m.user.mockResolvedValue({data:{user:null},error:null});expect((await onlineMembers({})).denied).toBe(true);expect((await memberContact(id)).denied).toBe(true);expect((await communityPresence(true)).denied).toBe(true);expect(m.rpc).not.toHaveBeenCalled();});
it("passes only channel/cursor or target; preference never accepts a user id",async()=>{await onlineMembers({channel:id,after:id});expect(m.rpc).toHaveBeenLastCalledWith("online_member_rail",{p_channel:id,p_after:id});await memberContact(id);expect(m.rpc).toHaveBeenLastCalledWith("member_contact",{p_target:id});await communityPresence(true);expect(m.rpc).toHaveBeenLastCalledWith("community_presence_preference",{p_share:true});});
it("reports throttling, missing migration, denied reads and network errors safely",async()=>{m.rpc.mockResolvedValueOnce({data:{limited:true}}).mockResolvedValueOnce({error:{code:"PGRST202",message:"secret internals"}}).mockResolvedValueOnce({error:{code:"42501"}}).mockRejectedValueOnce(Error("private provider data"));expect((await onlineMembers({})).error).toContain("wait");expect((await onlineMembers({})).error).toContain("database update");expect((await memberContact(id)).denied).toBe(true);expect(JSON.stringify(await communityPresence())).not.toContain("private provider data");});
