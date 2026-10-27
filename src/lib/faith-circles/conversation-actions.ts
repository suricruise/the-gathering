'use server';
import {conversationCommand,readCirclePrayers,readCirclePrayer,readPrayerComments,readPrayerReports,readConversationContext} from './conversation';
export async function saveConversation(input:unknown){return conversationCommand(input);}
export async function loadCirclePrayers(input:unknown){return readCirclePrayers(input);}
export async function loadCirclePrayer(circle:string,id:string){return readCirclePrayer(circle,id);}
export async function loadPrayerComments(input:unknown){return readPrayerComments(input);}
export async function loadPrayerReports(input:unknown){return readPrayerReports(input);}
export async function loadConversationContext(circle:string){return readConversationContext(circle);}
