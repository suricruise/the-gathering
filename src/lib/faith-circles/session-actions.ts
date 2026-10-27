'use server';
import{retrieveStudySessions,retrieveStudyQuestions}from'./backend';import{backendQuerySchema,type Page,type StudySession,type StudyQuestion}from'./backend-types';
import type{Result}from'./types';
export async function browseStudySessions(input:unknown):Promise<Result<Page<StudySession>>>{const p=backendQuerySchema.safeParse(input);return p.success?retrieveStudySessions(p.data):{error:'Choose a valid session page.'};}

export async function browseStudyQuestions(input:unknown):Promise<Result<Page<StudyQuestion>>>{const p=backendQuerySchema.safeParse(input);return p.success?retrieveStudyQuestions(p.data):{error:'Choose a valid question page.'};}
