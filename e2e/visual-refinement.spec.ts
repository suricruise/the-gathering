import {test,expect} from './helpers';
import {readFileSync,mkdirSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import AxeBuilder from '@axe-core/playwright';
test('lounge refinement preserves responsive navigation, covers and accessible visual baselines',async({memberPage:page,member},info)=>{
 test.setTimeout(180000);
 const phase=process.env.VISUAL_REFINEMENT_PHASE||'regression';
 const output=`docs/qa/refinement/${phase}`;mkdirSync(output,{recursive:true});
 const url=readFileSync('.local-stack/database-url','utf8').trim();if(!['localhost','127.0.0.1'].includes(new URL(url).hostname))throw Error('Isolated local fixtures only');const db=new pg.Client({connectionString:url});await db.connect();const id=randomUUID(),slug='refine-'+id.slice(0,8),title='000 QA Shared Stories';
 try{
  await db.query("insert into public.communities(id,slug,name,description,visibility,cover)values($1,$2,$3,'Local visual QA fixture: thoughtful conversations and shared interests.','private','aurora')",[id,slug,title]);await db.query("insert into public.community_members(community_id,user_id,role_id)values($1,$2,'owner')",[id,member.id]);
  for(const width of info.project.name==='mobile'?[390]:[1440,1024]){
   await page.setViewportSize({width,height:1000});
   for(const [name,route]of [['home','/home'],['explore','/communities'],['community',`/communities/${slug}`]]){
    await page.goto(route);await expect(page.locator('main h1')).toBeVisible();await page.evaluate(()=>document.fonts.ready);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),`${name} overflow at ${width}`).toBe(false);
    const scan=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();expect(scan.violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)}))).toEqual([]);
    if(phase!=='regression')await page.screenshot({path:`${output}/${width}-${name}.jpg`,type:'jpeg',quality:82,animations:'disabled'});
    const hero=name==='community'?page.locator('.community-landing-hero'):page.locator('.lounge-hero');
    if(phase==='regression')await expect(hero).toHaveScreenshot(`${width}-${name}-hero.png`,{animations:'disabled',maxDiffPixelRatio:.003});
    if(name==='home'){
     const card=page.locator('.lounge-featured-grid article').filter({has:page.getByRole('heading',{name:title,exact:true})});await expect(card).toBeVisible();const image=card.locator('img');await expect(image).toHaveJSProperty('complete',true);expect(await image.evaluate(el=>(el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
     if(phase!=='regression')await card.screenshot({path:`${output}/${width}-community-card.png`,animations:'disabled'});
     if(phase==='after'&&width===1440){await card.hover();await card.screenshot({path:`${output}/${width}-card-hover.png`,animations:'disabled'});await page.mouse.move(0,0);}
     if(phase==='regression')await expect(card).toHaveScreenshot(`${width}-community-card.png`,{mask:[card.locator('.lounge-card-counts')],animations:'disabled',maxDiffPixelRatio:.003});
    }
   }
  }
 }finally{await db.query('delete from public.communities where id=$1',[id]);await db.end();}
});
