import 'server-only';
export type ScriptureCapability={mode:'references'|'youversion';reason:'not-configured'|'approval-required'|'configured';message:string};
export function youVersionSettings(){
 const appKey=process.env.YOUVERSION_APP_KEY?.trim(),raw=process.env.YOUVERSION_VERSION_IDS??'';
 const ids=raw.split(',').map(x=>x.trim()).filter(Boolean);const versions=[...new Set(ids.map(Number))];
 if(process.env.SCRIPTURE_PROVIDER!=='youversion'||process.env.YOUVERSION_RIGHTS_CONFIRMED!=='true'||process.env.YOUVERSION_PLAIN_TEXT_DISPLAY_CONFIRMED!=='true'||!appKey||!versions.length||versions.length>10||ids.some(x=>!/^\d+$/.test(x))||versions.some(x=>!Number.isSafeInteger(x)||x<1))return null;
 return{appKey,versions};
}
export function scriptureCapability():ScriptureCapability{
 if(youVersionSettings())return{mode:'youversion',reason:'configured',message:'YouVersion is configured for explicitly approved translations. Passage text and current attribution load only on request; no Bible text is stored or cached.'};
 const configured=!!process.env.YOUVERSION_APP_KEY||process.env.SCRIPTURE_PROVIDER==='youversion';
 return{mode:'references',reason:configured?'approval-required':'not-configured',message:configured?'YouVersion needs its project key, approved translation IDs and confirmed display rights. Reference reading remains available.':'No licensed Bible provider is connected. Browse and save references, then read the text in your own Bible or the provider’s public reader.'};
}
