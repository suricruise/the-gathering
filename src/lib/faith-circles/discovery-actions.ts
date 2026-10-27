'use server';
import{readStudyCards,readMyCircles}from'./discovery';
export async function browseStudies(input:unknown){return readStudyCards(input);}
export async function browseMyCircles(input:unknown){return readMyCircles(input);}
