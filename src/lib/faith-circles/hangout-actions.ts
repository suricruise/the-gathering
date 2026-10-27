'use server';
import{saveStudyHangout,readStudyHangouts,readStudyHangout,readHangoutOptions,readHangoutQuestions}from'./hangouts';
export async function changeStudyHangout(input:unknown){return saveStudyHangout(input);}
export async function loadStudyHangouts(input:unknown){return readStudyHangouts(input);}
export async function loadStudyHangout(circle:string,id:string){return readStudyHangout(circle,id);}
export async function loadHangoutOptions(input:unknown){return readHangoutOptions(input);}
export async function loadHangoutQuestions(input:unknown){return readHangoutQuestions(input);}
