// @vitest-environment node
import{beforeEach,describe,it,expect,vi}from'vitest';
vi.mock('server-only',()=>({}));
const m=vi.hoisted(()=>({create:vi.fn(),auth:vi.fn(),rpc:vi.fn(),from:vi.fn()}));vi.mock('../supabase/server',()=>({createClient:m.create}));
import{readCircle,readCircles,readFaithHome}from'./data';import{circleCover,circleSchema}from'./types';import{safeNext}from'../auth/validation';
const id='11111111-1111-4111-8111-111111111111',next='22222222-2222-4222-8222-222222222222';
const circle={id,slug:'faith-circle',name:'Circle',description:'Shared study',privacy:'public',cover:'nebula',header_version:null,leader:null,joined:true,can_manage:false,owner:false,featured:true,study_title:'Growing',passage_reference:'John 15:1-8',schedule_note:'',members:1,discussion:null,hangout:null};
beforeEach(()=>{vi.clearAllMocks();m.create.mockResolvedValue({auth:{getUser:m.auth},rpc:m.rpc,from:m.from});m.auth.mockResolvedValue({data:{user:{id,email_confirmed_at:'now'}},error:null});m.rpc.mockImplementation((name:string)=>Promise.resolve({data:{items:name==='faith_circle_events'?[]:[circle]}}));});
describe('Faith Circles server boundary',()=>{
 it('rejects actor/role input and invalid IDs before querying',async()=>{expect((await readCircles({user_id:id})).error).toBeTruthy();expect((await readCircle('invalid')).denied).toBe(true);expect(m.create).not.toHaveBeenCalled();});
 it('requires verified authentication',async()=>{m.auth.mockResolvedValue({data:{user:{id}},error:null});expect((await readCircles({})).denied).toBe(true);expect(m.rpc).not.toHaveBeenCalled();});
 it('paginates using stable returned IDs with no client identity',async()=>{m.rpc.mockResolvedValue({data:{items:[circle,{...circle,id:next}]}});const r=await readCircles({size:1});expect(r.data?.items).toHaveLength(1);expect(r.data?.after).toBe(id);expect(m.rpc).toHaveBeenCalledWith('faith_circle_directory',{p_mode:'explore',p_after:null,p_size:1});});
 it('strips unapproved extra properties from RPC output',async()=>{m.rpc.mockResolvedValue({data:{...circle,email:'private@example.test',storage_path:'private'}});const r=await readCircle(id);expect(r.data).toEqual(circle);});
 it('treats invisible and nonexistent Circles identically',async()=>{m.rpc.mockResolvedValue({data:null});expect((await readCircle(id)).denied).toBe(true);expect((await readCircle(next)).denied).toBe(true);});
 it('reports missing migration and rate limit without fake empty success',async()=>{m.rpc.mockResolvedValue({error:{code:'PGRST202'}});expect((await readCircles({})).error).toContain('database update');m.rpc.mockResolvedValue({data:{limited:true}});expect((await readCircles({})).error).toContain('wait');});
 it('uses a protected event projection without direct table reads',async()=>{expect((await readFaithHome()).data?.events).toEqual({data:[]});expect(m.from).not.toHaveBeenCalled();});
 it('rejects malformed server DTOs',async()=>{m.rpc.mockResolvedValue({data:{...circle,privacy:'admin'}});expect((await readCircle(id)).data).toBeUndefined();});
 it('uses authenticated header route and safe fallback covers',()=>{expect(circleCover(circleSchema.parse(circle))).toBe('/covers/nebula.svg');expect(circleCover(circleSchema.parse({...circle,header_version:'v?x=1'}))).toBe(`/api/communities/${id}/header?v=v%3Fx%3D1`);});
 it('preserves safe post-login Circle routes and rejects external redirects',()=>{expect(safeNext('/faith-circles/'+id)).toBe('/faith-circles/'+id);expect(safeNext('//evil.test/faith-circles')).toBe('/home');});
});
