// @vitest-environment node
vi.mock('server-only',()=>({}));
import{beforeEach,it,expect,vi}from'vitest';
const m=vi.hoisted(()=>({rpc:vi.fn(),getUser:vi.fn()}));vi.mock('../supabase/server',()=>({createClient:async()=>({rpc:m.rpc,auth:{getUser:m.getUser}})}));
import{commandBuilder,readBuilderDetail}from'./builder';import{builderCommandSchema}from'./builder-types';
const circle='11111111-1111-4111-8111-111111111111',study='22222222-2222-4222-8222-222222222222';
beforeEach(()=>{vi.clearAllMocks();m.getUser.mockResolvedValue({data:{user:{email_confirmed_at:'now'}},error:null});m.rpc.mockResolvedValue({data:{id:study,revision:2},error:null});});
it('requires verified Auth before invoking authoring RPCs',async()=>{m.getUser.mockResolvedValue({data:{user:null},error:null});expect((await commandBuilder({circle,study,operation:'create'})).denied).toBe(true);expect(m.rpc).not.toHaveBeenCalled();});
it('rejects client identity and role spoofing before invoking the database',async()=>{expect((await commandBuilder({circle,study,operation:'create',role:'owner'})).error).toBeTruthy();expect(m.rpc).not.toHaveBeenCalled();});
it('uses current database permissions rather than claiming a successful publication',async()=>{m.rpc.mockResolvedValue({error:{code:'42501'},data:null});const r=await commandBuilder({circle,study,revision:2,operation:'publish',rights_confirmed:true});expect(r.denied).toBe(true);expect(r.data).toBeUndefined();});
it('reports stale revisions without discarding the draft',async()=>{m.rpc.mockResolvedValue({error:{code:'40001'},data:null});expect((await commandBuilder({circle,study,revision:1,operation:'archive',reason:'Withdraw old edition'})).error).toContain('draft has been kept');});
it('bounds payloads and rejects unsafe media URLs',()=>{const v={circle,study,revision:1,operation:'session',id:study,title:'Lesson',scripture_reference:'John 1:1',teaching_content:'Teaching',application_challenge:'Apply',prayer_prompt:'Pray',release_at:null,questions:[{id:circle,question_text:'Why?'}]};for(const media_link of ['javascript:alert(1)','http://example.org','https://user:password@example.org'])expect(builderCommandSchema.safeParse({...v,media_link}).success).toBe(false);expect(builderCommandSchema.safeParse({...v,media_link:'https://example.org/resource'}).success).toBe(true);});
it('does not forward provider diagnostics or invalid response bodies',async()=>{m.rpc.mockResolvedValue({data:{private:'secret'},error:null});expect((await readBuilderDetail(circle,study)).data).toBeUndefined();});
