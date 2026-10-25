// @vitest-environment node
import {beforeEach,describe,it,expect,vi} from "vitest";
const mocks=vi.hoisted(()=>({requireUser:vi.fn(),rpc:vi.fn()}));
vi.mock("../auth/session",()=>({requireUser:mocks.requireUser}));vi.mock("next/cache",()=>({revalidatePath:vi.fn()}));
import{manageChannel}from"./channel-management-actions";
function form(extra:Record<string,string>={}){const f=new FormData();for(const[k,v]of Object.entries({community_id:"11111111-1111-4111-8111-111111111111",operation:"save",id:"",name:"lounge",description:"",kind:"voice",category_id:"",position:"0",attachment_policy:"posters",notification_default:"inherit",reason:"Create voice channel",...extra}))f.set(k,v);return f;}
beforeEach(()=>{vi.clearAllMocks();mocks.requireUser.mockResolvedValue({client:{rpc:mocks.rpc}});mocks.rpc.mockResolvedValue({error:null,data:{saved:true}});});
describe("verified channel management action",()=>{
 it("accepts framework action metadata while deriving unchecked checkboxes server-side",async()=>{expect((await manageChannel({},form({"$ACTION_REF_fixture":""}))).notice).toBeTruthy();expect(mocks.rpc).toHaveBeenCalledWith("channel_management",expect.objectContaining({p_data:expect.objectContaining({is_private:false})}));});
 it("rejects client-supplied actor or role instead of forwarding them",async()=>{expect((await manageChannel({},form({actor_id:"forged",role:"owner"}))).error).toBeTruthy();expect(mocks.rpc).not.toHaveBeenCalled();});
 it("does not report success on a database permission denial",async()=>{mocks.rpc.mockResolvedValue({error:{code:"42501"}});expect((await manageChannel({},form())).error).toBeTruthy();});
 it("requires a verified session even for valid inputs",async()=>{mocks.requireUser.mockRejectedValue(Error("Sign in"));await expect(manageChannel({},form())).rejects.toThrow("Sign in");expect(mocks.rpc).not.toHaveBeenCalled();});
});
