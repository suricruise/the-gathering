// @vitest-environment node
import {beforeEach,describe,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({rpc:vi.fn(),auth:vi.fn()}));
vi.mock('../auth/session',()=>({requireUser:mocks.auth}));
import {getChatState,getConversationPage,getReceiptSnapshot,markAllRead,getCommunityChatState} from './reliability';
const id='a4000000-0000-4000-8000-000000000001';
beforeEach(()=>{vi.resetAllMocks();mocks.auth.mockResolvedValue({client:{rpc:mocks.rpc}});mocks.rpc.mockResolvedValue({data:{watermark:'1'},error:null});});
describe('reliability server actions',()=>{
 it('rejects forged scope, invalid cursors and oversized receipt batches before RPC',async()=>{
 for(const input of [{channelId:id,mode:'everything'},{channelId:id,mode:'before'},{channelId:id,mode:'after',cursor:'-1'},{channelId:id,userId:id},{channelId:'bad'}])expect((await getConversationPage(input)).error).toBeTruthy();
 expect((await getReceiptSnapshot(id,Array(101).fill(id))).error).toBeTruthy();expect((await getCommunityChatState('bad')).error).toBeTruthy();expect((await markAllRead('bad')).error).toBeTruthy();expect(mocks.rpc).not.toHaveBeenCalled();
 });
 it('passes exact bigint cursors and derives identity from the authenticated session',async()=>{
 await getConversationPage({channelId:id,mode:'after',cursor:'9007199254740993'});expect(mocks.auth).toHaveBeenCalledWith('/channels');expect(mocks.rpc).toHaveBeenCalledWith('chat_conversation_page',{p_channel:id,p_mode:'after',p_cursor:'9007199254740993'});
 });
 it('maps denied and missing migrations without leaking server details',async()=>{
 mocks.rpc.mockResolvedValueOnce({error:{code:'42501',message:'private evidence'}});expect(await getChatState(id)).toEqual({denied:true,error:'Channel access is unavailable.'});
 mocks.rpc.mockResolvedValueOnce({error:{code:'PGRST202'}});expect((await getChatState(id)).error).toContain('database update');
 mocks.rpc.mockRejectedValueOnce(Error('secret'));expect((await getChatState(id)).error).not.toContain('secret');
 });
});
