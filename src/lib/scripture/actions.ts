'use server';
import{readScriptureBookmarks,mutateScriptureBookmark}from'./bookmarks';
export async function loadScriptureBookmarks(input:unknown){return readScriptureBookmarks(input);}
export async function saveScriptureBookmark(input:unknown){return mutateScriptureBookmark(input);}
