'use client';
import{useState}from'react';
export function ProfileCoverImage({id,version}:{id:string;version:string}){
 const[failed,setFailed]=useState(false);
 return failed?null:<img className="profile-cover-image" src={`/api/profile-covers/${id}?v=${encodeURIComponent(version)}`} alt="" onError={()=>setFailed(true)} loading="lazy" decoding="async"/>;
}
