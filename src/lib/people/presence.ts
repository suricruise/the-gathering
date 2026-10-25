"use client";
import { useEffect, useRef, useState } from "react";
/** A failed/offline fetch must not leave a green dot indefinitely. No activity times are exposed. */
export function usePresenceFreshness(source: unknown) {
  const updated = useRef(Date.now());
  const [fresh,setFresh]=useState(true);
  useEffect(()=>{updated.current=Date.now();setFresh(navigator.onLine);},[source]);
  useEffect(()=>{
    const check=()=>setFresh(navigator.onLine&&Date.now()-updated.current<20000);
    const timer=setInterval(check,2000);window.addEventListener("offline",check);window.addEventListener("online",check);document.addEventListener("visibilitychange",check);
    return()=>{clearInterval(timer);window.removeEventListener("offline",check);window.removeEventListener("online",check);document.removeEventListener("visibilitychange",check);};
  },[]);
  return fresh;
}
export function presenceLabel(online: boolean|null, fresh: boolean) { return online===null?"Status hidden":!fresh?"Status unavailable":online?"Online":"Offline"; }
