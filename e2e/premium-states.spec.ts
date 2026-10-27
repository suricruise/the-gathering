import {test,expect} from './helpers';
import {mkdirSync} from 'node:fs';
test('Hangouts shows actual delayed, failed, recovered and offline request states',async({memberPage:page},info)=>{
 test.setTimeout(90000);const width=info.project.name==='mobile'?390:1440;const captureDir=process.env.PREMIUM_VISUAL_OUTPUT||'docs/qa/premium';mkdirSync(captureDir,{recursive:true});
 let release:()=>void=()=>{};const held=new Promise<void>(r=>{release=r;});
 await page.route('**/voice',async route=>{if(route.request().method()==='POST')await held;await route.continue();});
 try{
  await page.goto('/voice');await expect(page.getByText('Loading your permitted Hangouts…',{exact:true})).toBeVisible();
  await page.screenshot({path:`${captureDir}/${width}-loading.jpg`,type:'jpeg',quality:75});release();await page.unrouteAll({behavior:'wait'});
  await expect(page.getByRole('region',{name:'Rooms in my communities',exact:true})).toBeVisible();
  await page.route('**/voice',route=>route.request().method()==='POST'?route.abort('failed'):route.continue());
  await page.getByRole('button',{name:'Refresh rooms',exact:true}).click();await expect(page.getByRole('button',{name:'Retry rooms',exact:true})).toBeVisible();
  await page.screenshot({path:`${captureDir}/${width}-error.jpg`,type:'jpeg',quality:75});await page.unroute('**/voice');
  await page.getByRole('button',{name:'Retry rooms',exact:true}).click();await expect(page.getByRole('region',{name:'Rooms in my communities',exact:true})).toBeVisible();
  await page.context().setOffline(true);await expect(page.getByRole('status').filter({hasText:'You’re offline. Live room activity is unavailable.'})).toBeVisible();
  await page.screenshot({path:`${captureDir}/${width}-offline.jpg`,type:'jpeg',quality:75});await page.context().setOffline(false);
  await expect(page.getByRole('region',{name:'Rooms in my communities',exact:true})).toBeVisible();
 }finally{release();if(!page.isClosed()){await page.unrouteAll({behavior:'ignoreErrors'});await page.context().setOffline(false);}}
});
