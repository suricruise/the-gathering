// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mock=vi.hoisted(()=>({verify:vi.fn(),exchange:vi.fn(),origin:vi.fn(),client:vi.fn()}));
vi.mock("server-only",()=>({}));
vi.mock("../supabase/server",()=>({createClient:mock.client}));
vi.mock("../config",()=>({appOrigin:mock.origin,publicConfig:()=>({url:"https://auth.test",key:"public"})}));
import { GET as confirm } from "../../../app/auth/confirm/route";
import { GET as callback } from "../../../app/auth/callback/route";
beforeEach(()=>{vi.resetAllMocks();mock.origin.mockReturnValue("https://gathering.test");mock.client.mockResolvedValue({auth:{verifyOtp:mock.verify,exchangeCodeForSession:mock.exchange}});mock.verify.mockResolvedValue({error:null});mock.exchange.mockResolvedValue({error:null});});
it("validates before consuming links and strips tokens from failure destinations",async()=>{
 const response=await confirm(new NextRequest("https://gathering.test/auth/confirm?token_hash=private-secret&type=administrator"));
 expect(response.status).toBe(303);expect(response.headers.get("location")).toBe("/verify-email?reason=invalid");expect(response.headers.get("cache-control")).toContain("no-store");expect(response.headers.get("referrer-policy")).toBe("no-referrer");expect(mock.verify).not.toHaveBeenCalled();
});
it("verifies token-hash links without requiring the originating browser verifier",async()=>{
 const response=await confirm(new NextRequest("https://gathering.test/auth/confirm?token_hash=one-use-hash&type=email"));
 expect(mock.verify).toHaveBeenCalledWith({token_hash:"one-use-hash",type:"email"});expect(response.headers.get("location")).toBe("https://gathering.test/onboarding");
});
it("preserves real recovery routing",async()=>{
 const response=await confirm(new NextRequest("https://gathering.test/auth/confirm?token_hash=one-use-hash&type=recovery"));expect(response.headers.get("location")).toBe("https://gathering.test/reset-password");
});
it("does not consume a valid token if the configured destination is broken",async()=>{
 mock.origin.mockImplementation(()=>{throw Error("Invalid APP_URL");});
 const response=await confirm(new NextRequest("https://untrusted-host.test/auth/confirm?token_hash=one-use-hash&type=email"));
 expect(response.headers.get("location")).toBe("/verify-email?reason=configuration");expect(mock.verify).not.toHaveBeenCalled();
});
it("handles provider failures with visible help instead of an empty handler exception",async()=>{
 mock.verify.mockRejectedValue(Error("sensitive provider details"));
 const response=await confirm(new NextRequest("https://gathering.test/auth/confirm?token_hash=one-use-hash&type=email"));expect(response.headers.get("location")).toBe("/verify-email?reason=unavailable");expect(await response.text()).not.toContain("sensitive provider details");
});
it("explains missing PKCE state and confines callback redirects to approved paths",async()=>{
 mock.exchange.mockResolvedValueOnce({error:{code:"pkce_code_verifier_not_found",status:400}});
 const failed=await callback(new NextRequest("https://gathering.test/auth/callback?code=secret-code"));expect(failed.headers.get("location")).toBe("/verify-email?reason=browser");
 const ok=await callback(new NextRequest("https://gathering.test/auth/callback?code=secret-code&next=https://attacker.test"));expect(ok.headers.get("location")).toBe("https://gathering.test/onboarding");
});
it("turns callback dependency exceptions into a safe actionable response",async()=>{
 mock.exchange.mockRejectedValue(Error("private details"));const response=await callback(new NextRequest("https://gathering.test/auth/callback?code=secret-code"));expect(response.headers.get("location")).toBe("/verify-email?reason=unavailable");
});

it("distinguishes returned SDK network failures from expired links",async()=>{
 mock.verify.mockResolvedValue({error:{name:"AuthRetryableFetchError",status:0}});
 const response=await confirm(new NextRequest("https://gathering.test/auth/confirm?token_hash=one-use-hash&type=email"));expect(response.headers.get("location")).toBe("/verify-email?reason=unavailable");
});
