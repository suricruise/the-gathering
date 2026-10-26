'use server';
import {readCircles} from './data';
export async function browseCircles(input:unknown){return readCircles(input);}
