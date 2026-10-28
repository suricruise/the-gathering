import { ProfileCoverImage } from "./ProfileCoverImage";
import Link from "next/link";
import { ProfileAvatar } from "../ui";
import { interestLabels } from "../../lib/profiles/interests";
import type { ProfileDetails } from "../../lib/profiles/lounge";
export function ProfileCover({name,id,version}:{name:string;id?:string;version?:string|null}) {
 return <div className="premium-profile-cover" aria-hidden="true">{id&&version?<ProfileCoverImage key={version} id={id} version={version}/>:<><span>THE GATHERING</span><i/><b>{name.slice(0,1).toUpperCase()}</b></>}</div>;
}
export function MiniProfileCard({id,name,username,avatar,coverVersion}:{id?:string;name:string;username:string;avatar:boolean;coverVersion?:string|null}) {
 return <Link href={id?`/members/${id}`:"/profile"} className="premium-mini-profile"><div className="premium-mini-cover" aria-hidden="true">{id&&coverVersion&&<ProfileCoverImage key={coverVersion} id={id} version={coverVersion}/>}</div>{avatar&&id?<img src={`/api/avatars/${id}`} width={64} height={64} alt=""/>:<ProfileAvatar name={name} size="large"/>}<strong>{name}</strong><span>@{username}</span><small>Find Your People. Find Your Place.</small></Link>;
}
export function ProfileConnections({details,error}:{details?:ProfileDetails;error?:string}) {
 if(!details)return <p className="muted" role="status">{error||"Community connections unavailable."}</p>;
 return <div className="premium-profile-connections"><section><h2>Interests</h2>{details.interests.length?<div className="tag-row">{details.interests.map(i=><span className="pill" key={i}>{interestLabels[i]||i}</span>)}</div>:<p className="muted">No interests shared on this profile.</p>}</section><section><h2>Communities</h2><p className="muted">Public communities and communities you share · up to 30</p>{details.communities.length?<ul>{details.communities.map(c=><li key={c.id}><Link href={`/communities/${c.slug}`}>{c.name}</Link>{c.mutual&&<span className="pill">Mutual community</span>}</li>)}</ul>:<p className="muted">No visible communities to show.</p>}</section></div>;
}
