"use server";
import { createClient } from "../supabase/server";
import type { Result, Person } from "../people/types";
export type ProfileDetails = { interests: string[]; communities: { id: string; slug: string; name: string; mutual: boolean }[] };
export async function profileDetails(username: string): Promise<Result<ProfileDetails>> {
 if (!/^[a-z][a-z0-9_]{2,23}$/.test(username)) return {error:"Profile unavailable."};
 try { const client=await createClient();const identity=await client.auth.getUser();if(identity.error||!identity.data.user?.email_confirmed_at)return {error:"Sign in to view community connections."};
 const r=await client.rpc("lounge_profile",{p_username:username});return r.error||!r.data||r.data.limited?{error:"Community connections and interests are unavailable. Please retry."}:{data:r.data};
 } catch {return {error:"Profile services unavailable. Please retry."};}
}
export async function discoverMembers(): Promise<Result<{items:Person[]}>> {
 try {const client=await createClient();const identity=await client.auth.getUser();if(identity.error||!identity.data.user?.email_confirmed_at)return {error:"Sign in to discover members."};const r=await client.rpc("lounge_people");return r.error||r.data?.limited?{error:"Recommendations unavailable. Search by username or retry later."}:{data:r.data};} catch {return {error:"Recommendations unavailable. Please retry."};}
}
