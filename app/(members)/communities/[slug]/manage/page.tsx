import Link from "next/link";
import {notFound} from "next/navigation";
import {requireUser} from "@/src/lib/auth/session";
import {ChannelManager} from "@/src/components/communities/ChannelManager";
import type {ChannelManagementData} from "@/src/lib/communities/channel-management";
export default async function ManageChannels({params}:{params:Promise<{slug:string}>}){
 const {slug}=await params;
 const isId=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slug);
 if(!isId&&!/^[a-z][a-z0-9-]{2,47}$/.test(slug))notFound();
 const {client}=await requireUser("/communities");
 const {data:community}=isId?{data:{id:slug}}:await client.from("communities").select("id").eq("slug",slug).maybeSingle();
 if(!community)notFound();
 const {data,error}=await client.rpc("channel_management",{p_community:community.id});
 if(error||!data)return <div className="page"><h1>Channel management unavailable</h1><p role="alert">Community administrators manage channels. Moderators can manage posting restrictions. Check your permissions or ask an administrator to install the Stage 8 database update.</p><Link href={`/communities/${slug}`}>Back to community</Link></div>;
 return <ChannelManager community={community.id} slug={data.community_slug} data={data as ChannelManagementData}/>;
}
