"use client";
import{createContext,useContext}from'react';
export const ChatIdentity=createContext<{username:string;canMassMention:boolean;role?:string}|null>(null);
export const useChatIdentity=()=>useContext(ChatIdentity);
export function mentionsMember(body:string,username:string){return !!username&&new RegExp(`(?:^|\\s)@${username.replace(/[^a-z0-9_]/gi,'')}\\b(?!:)`,'i').test(body.replace(/```[\s\S]*?```/g,'').replace(/`[^`]*`/g,''));}
