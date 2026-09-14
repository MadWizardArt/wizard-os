import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
const browser = await chromium.launch({headless:true});
try {
 const page = await browser.newPage({viewport:{width:390,height:844}});
 const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:3000';
 await page.goto(base);

 await page.waitForFunction(()=>{
  const date=document.querySelector('.topbar:has(.dashboardActions) .eyebrow');
  const warlock=document.querySelector('.dashboardActions .warlockMobile');
  const order=[...document.querySelectorAll('.dashboardActions button')].find(el=>el.textContent?.includes('+ New Work Order'));
  const museum=document.querySelector('a[aria-label="Enter The Museum"]');
  return date instanceof HTMLElement && date.clientWidth>0 && warlock instanceof HTMLElement && order instanceof HTMLElement && museum instanceof HTMLElement;
 });
 const mobileLayout=await page.evaluate(()=>{
  const date=document.querySelector('.topbar:has(.dashboardActions) .eyebrow');
  const title=document.querySelector('.topbar:has(.dashboardActions) h2');
  const warlock=document.querySelector('.dashboardActions .warlockMobile');
  const order=[...document.querySelectorAll('.dashboardActions button')].find(el=>el.textContent?.includes('+ New Work Order'));
  const museum=document.querySelector('a[aria-label="Enter The Museum"]');
  if(!(date instanceof HTMLElement) || !(title instanceof HTMLElement) || !(warlock instanceof HTMLElement) || !(order instanceof HTMLElement) || !(museum instanceof HTMLElement)) throw new Error('Mobile header elements missing');
  const dateStyle=getComputedStyle(date);
  const titleStyle=getComputedStyle(title);
  const warlockRect=warlock.getBoundingClientRect();
  const orderRect=order.getBoundingClientRect();
  const museumRect=museum.getBoundingClientRect();
  return {
   date:{scrollWidth:date.scrollWidth,clientWidth:date.clientWidth,whiteSpace:dateStyle.whiteSpace,text:date.textContent?.trim() ?? ''},
   titleSize:Number.parseFloat(titleStyle.fontSize),
   warlock:{display:getComputedStyle(warlock).display,x:warlockRect.x,y:warlockRect.y,width:warlockRect.width,height:warlockRect.height},
   order:{x:orderRect.x,y:orderRect.y,width:orderRect.width,height:orderRect.height},
   museum:{width:museumRect.width,height:museumRect.height,text:museum.textContent?.trim() ?? ''},
  };
 });
 assert.equal(mobileLayout.date.whiteSpace,'nowrap',`Crucible date should stay on one line: ${JSON.stringify(mobileLayout)}`);
 assert.ok(mobileLayout.date.scrollWidth<=mobileLayout.date.clientWidth,`Crucible date should fit at 390px: ${JSON.stringify(mobileLayout)}`);
 assert.ok(mobileLayout.titleSize<=21,`Crucible mobile title should use the compact size: ${JSON.stringify(mobileLayout)}`);
 assert.notEqual(mobileLayout.warlock.display,'none','Warlock should be visible on mobile');
 assert.ok(Math.abs(mobileLayout.warlock.y-mobileLayout.order.y)<2,`Warlock and New Work Order should share one row: ${JSON.stringify(mobileLayout)}`);
 assert.ok(mobileLayout.museum.width<=40 && mobileLayout.museum.height<=40,`Museum portal should be a discreet mobile sigil: ${JSON.stringify(mobileLayout)}`);
 assert.equal(mobileLayout.museum.text,'✦');

 await page.getByRole('button',{name:'☰ Menu',exact:true}).click();
 const menu=page.getByRole('dialog',{name:'Explore Wizard OS'});
 await menu.waitFor({state:'visible'});
 const labels=(await menu.getByRole('link').allTextContents()).map(label=>label.replace('›','').trim());
 assert.equal(labels.length,9);
 assert.equal(labels.includes('Queue'),false);
 assert.equal(labels.includes('The Museum'),false);
 assert.ok(labels.indexOf('Campaigns') < labels.indexOf('Money'));
 assert.ok(labels.indexOf('Projects') < labels.indexOf('Money'));
 await menu.getByRole('link',{name:'Projects',exact:true}).click();
 await page.waitForURL('**/?view=projects');
 await page.getByRole('heading',{name:'Projects',exact:true}).waitFor();
 await page.getByRole('button',{name:'☰ Menu',exact:true}).click();
 assert.equal(await menu.getByRole('link',{name:'Projects',exact:true}).getAttribute('aria-current'),'page');
 await menu.getByRole('link',{name:'Money',exact:true}).click();
 await page.waitForURL('**/?view=money');
 await page.getByRole('heading',{name:/Money/}).first().waitFor();
 await page.getByRole('button',{name:'☰ Menu',exact:true}).click();
 assert.equal(await menu.getByRole('link',{name:'Money',exact:true}).getAttribute('aria-current'),'page');
 await page.keyboard.press('Escape');
 await menu.waitFor({state:'hidden'});
 for(const name of ['Inventory & Sold','Campaigns','Calendar','Warlock']) {
  await page.getByRole('button',{name:'☰ Menu',exact:true}).click();
  await Promise.all([page.waitForEvent('load'),menu.getByRole('link',{name,exact:true}).click()]);
  await page.getByRole('button',{name:'☰ Menu',exact:true}).waitFor();
 }
 await page.setViewportSize({width:1280,height:900});
 assert.equal(await page.getByRole('button',{name:'☰ Menu',exact:true}).isVisible(),false);
 console.log('Mobile UI: Crucible header, private Museum sigil, simplified navigation, project route, ordering, active state, Escape and desktop visibility passed.');
} finally { await browser.close(); }