// @vitest-environment node
import{beforeEach,describe,it,expect,vi}from'vitest';
const m=vi.hoisted(()=>({client:vi.fn(),auth:vi.fn(),rpc:vi.fn(),from:vi.fn()}));
vi.mock('../supabase/server',()=>({createClient:m.client}));vi.mock('../chat/workspace',()=>({workspaceNavigation:vi.fn()}));
import{shellNavigation,suggestedMembers}from'./actions';
const id='11111111-1111-4111-8111-111111111111';
beforeEach(()=>{vi.clearAllMocks();m.client.mockResolvedValue({auth:{getUser:m.auth},rpc:m.rpc,from:m.from});m.auth.mockResolvedValue({data:{user:{id,email_confirmed_at:'now'}},error:null});m.rpc.mockImplementation((name:string)=>Promise.resolve(name==='member_communities'?{data:[{id,name:'Real community',slug:'real-community'}]}:name==='channel_unread_counts'?{data:[{unread_count:'2'}]}:{data:{items:[]}}));m.from.mockImplementation(()=>({select:()=>({in:()=>Promise.resolve({data:[{id,cover:'nebula',community_headers:{version:'verified'}}]})})}));});
describe('authorized premium shell projections',()=>{
 it('requires verified identity before reading membership metadata',async()=>{m.auth.mockResolvedValue({data:{user:null},error:null});expect((await shellNavigation('/home')).denied).toBe(true);expect(m.rpc).not.toHaveBeenCalled();});
 it('validates navigation page limits before querying',async()=>{expect((await shellNavigation('/home',201)).error).toBeTruthy();expect((await shellNavigation('x')).error).toBeTruthy();expect(m.client).not.toHaveBeenCalled();});
 it('uses joined communities and private header endpoints with real unread state',async()=>{const r=await shellNavigation('/home');expect(r.data?.communities).toEqual([{id,name:'Real community',slug:'real-community',image:`/api/communities/${id}/header?v=verified`,unread:true}]);expect(m.rpc).toHaveBeenCalledWith('member_communities');});
 it('never presents an unread query failure as a read community',async()=>{m.rpc.mockImplementation((name:string)=>Promise.resolve(name==='member_communities'?{data:[{id,name:'Real community',slug:'real-community'}]}:{error:{code:'42501'}}));expect((await shellNavigation('/home')).data?.communities[0].unread).toBeNull();});
 it('does not retain membership metadata after an authorization denial',async()=>{m.rpc.mockResolvedValue({error:{code:'42501'}});const r=await shellNavigation('/home');expect(r.denied).toBe(true);expect(r.data).toBeUndefined();});
 it('keeps the selected joined community beyond the first rail page and gives empty communities a real context',async()=>{
  const second='22222222-2222-4222-8222-222222222222';
  m.rpc.mockImplementation((name:string)=>Promise.resolve(name==='member_communities'?{data:[{id,name:'First',slug:'first'},{id:second,name:'Selected',slug:'selected'}]}:name==='community_my_role'?{data:'owner'}:{data:[]}));
  m.from.mockImplementation((table:string)=>{const query={in:()=>Promise.resolve({data:[]}),eq:()=>query,order:()=>query,limit:()=>Promise.resolve({data:[]})};return{select:()=>table==='communities'?query:query};});
  const r=await shellNavigation('/communities/selected',1);
  expect(r.data?.selected).toBe(second);expect(r.data?.communities.map(c=>c.id)).toEqual([id,second]);expect(r.data?.hasMore).toBe(true);expect(r.data?.context?.navigation?.channels).toEqual([]);expect(r.data?.context?.navigation?.role).toBe('owner');
 });
 it('does not fabricate recent members when the additive projection is missing',async()=>{m.rpc.mockImplementation((name:string)=>Promise.resolve(name==='lounge_new_members'?{error:{code:'PGRST202'}}:{data:{items:[]}}));expect((await suggestedMembers()).data).toEqual({items:[],newMembers:null});});
});
