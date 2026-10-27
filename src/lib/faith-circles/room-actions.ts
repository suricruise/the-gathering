'use server';
import{revalidatePath}from'next/cache';import{roomScopeSchema}from'./room-types';
import{mutateRoom,readRoomQuestions,readRoomSessions,readSharedAnswers}from'./room';
export async function saveRoom(input:unknown){const r=await mutateRoom(input);if(r.data){revalidatePath('/faith-circles','page');const p=roomScopeSchema.safeParse(input&&typeof input==='object'?{circle:Reflect.get(input,'circle'),study:Reflect.get(input,'study'),session:Reflect.get(input,'session')}:null);if(p.success)revalidatePath(`/faith-circles/${p.data.circle}/studies/${p.data.study}`,'page');}return r;}
export async function loadRoomQuestions(input:unknown){return readRoomQuestions(input);}
export async function loadRoomSessions(input:unknown){return readRoomSessions(input);}
export async function loadSharedAnswers(input:unknown){return readSharedAnswers(input);}
