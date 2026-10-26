// @vitest-environment node
import {beforeEach,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({auth:vi.fn(),rpc:vi.fn()}));
vi.mock("../supabase/server",()=>({createClient:async()=>({auth:{getUser:m.auth},rpc:m.rpc})}));
import {profileDetails,discoverMembers} from "./lounge";
beforeEach(()=>{vi.clearAllMocks();m.auth.mockResolvedValue({data:{user:{id:"actor",email_confirmed_at:"yes"}},error:null});});
it("rejects malformed profile lookups without querying",async()=>{expect((await profileDetails("<script>")).error).toBeTruthy();expect(m.rpc).not.toHaveBeenCalled();});
it("requires verified authentication for discovery and profile relationships",async()=>{m.auth.mockResolvedValue({data:{user:null},error:null});expect((await discoverMembers()).error).toBeTruthy();expect((await profileDetails("member")).error).toBeTruthy();expect(m.rpc).not.toHaveBeenCalled();});
it("does not return data on denial or rate limits",async()=>{m.rpc.mockResolvedValue({data:{limited:true},error:null});expect((await profileDetails("member")).data).toBeUndefined();m.rpc.mockResolvedValue({error:{code:"42501"}});expect((await discoverMembers()).data).toBeUndefined();});
it("uses verified RPC identity instead of caller-controlled IDs",async()=>{m.rpc.mockResolvedValue({data:{interests:["music"],communities:[]},error:null});expect((await profileDetails("member")).data?.interests).toEqual(["music"]);expect(m.rpc).toHaveBeenCalledWith("lounge_profile",{p_username:"member"});});
