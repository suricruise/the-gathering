// @vitest-environment node
import {expect,it,vi} from 'vitest';
import type {SupabaseClient} from '@supabase/supabase-js';
vi.mock('server-only',()=>({}));
import {loadMemberIdentity} from './data';
function fixture(data:unknown,error:unknown=null){const q={select:vi.fn(()=>q),eq:vi.fn(()=>q),single:vi.fn(async()=>({data,error}))};return {q,client:{from:vi.fn(()=>q)} };}
it('loads shell identity without depending on preference migrations or gaming catalogs',async()=>{const identity={id:'verified',username:'member',display_name:'Member',avatar_path:null};const {client}=fixture(identity);expect(await loadMemberIdentity(client as unknown as SupabaseClient,'verified')).toEqual(identity);expect(client.from.mock.calls).toEqual([['profiles']]);});
it.each([{data:null,error:null},{data:null,error:{code:'42501'}}])('fails closed when the verified identity cannot be read',async({data,error})=>{const {client}=fixture(data,error);await expect(loadMemberIdentity(client as unknown as SupabaseClient,'verified')).rejects.toThrow('identity is unavailable');});
