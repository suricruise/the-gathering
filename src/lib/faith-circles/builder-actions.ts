'use server';
import{commandBuilder,readBuilderStudies,readBuilderDetail,readBuilderSessions,readBuilderSession,readBuilderAudit}from'./builder';
export async function saveBuilder(input:unknown){return commandBuilder(input);}
export async function loadBuilderStudies(input:unknown){return readBuilderStudies(input);}
export async function loadBuilderDetail(circle:string,study:string){return readBuilderDetail(circle,study);}
export async function loadBuilderSessions(input:unknown){return readBuilderSessions(input);}
export async function loadBuilderSession(circle:string,study:string,session:string){return readBuilderSession(circle,study,session);}
export async function loadBuilderAudit(circle:string,study:string){return readBuilderAudit(circle,study);}
