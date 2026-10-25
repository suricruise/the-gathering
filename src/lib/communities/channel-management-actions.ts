"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "../auth/session";
import { channelManagementSchema } from "./channel-management";
export async function manageChannel(_previous: {error?:string;notice?:string},form:FormData):Promise<{error?:string;notice?:string}> {
 const {client}=await requireUser("/communities");
 const community=String(form.get("community_id")??"");
 if(!/^[0-9a-f-]{36}$/i.test(community))return {error:"Choose a valid community."};
 const raw:Record<string,unknown>=Object.fromEntries([...form.entries()].filter(([key])=>!["community_id","operation"].includes(key)&&!key.startsWith("$ACTION_")));
 if(form.get("operation")==="save")raw.is_private=form.get("is_private")==="on";
 const parsed=channelManagementSchema.safeParse({operation:form.get("operation"),data:raw});
 if(!parsed.success)return {error:"Check the channel settings, confirmation and reason."};
 try {
  const {error}=await client.rpc("channel_management",{p_community:community,p_operation:parsed.data.operation,p_data:parsed.data.data});
  if(error)return {error:error.code==="22023"?"Keep one active text channel. Delete only archived, empty, unlinked channels. Check the confirmation and channel type.":"Change unavailable. Check your current permissions, channel name and entries; wait before retrying repeated changes."};
  revalidatePath("/","layout");return {notice:"Change saved. Existing channel history is preserved."};
 }catch{return {error:"Channel services are unavailable. Please retry."};}
}
