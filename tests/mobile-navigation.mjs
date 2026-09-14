import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
const browser = await chromium.launch({headless:true});
try {
 const page = await browser.newPage({viewport:{width:390,height:844}});
 const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:3000';
 await page.goto(base);

 const crucibleDate=page.locator('.topbar:has(.dashboardActions) .eyebrow');
 await crucibleDate.waitFor({state:'visible'});
 const dateLayout=await crucibleDate.evaluate((el)=>({
  scrollWidth:el.scrollWidth,
  clientWidth:el.clientWidth,
  whiteSpace:getComputedStyle(el).whiteSpace,
  fontSize:getComputedStyle(el).fontSize,
  letterSpacing:getComputedStyle(el).letterSpacing,
  display:getComputedStyle(el).display,
  width:getComputedStyle(el).width,
  parentDisplay:el.parentElement ? getComputedStyle(el.parentElement).display : null,
  parentWidth:el.parentElement ? getComputedStyle(el.parentElement).width : null,
 }));
 console.log('Crucible date layout',dateLayout);
 assert.equal(dateLayout.whiteSpace,'nowrap',`Crucible date white-space mismatch: ${JSON.stringify(dateLayout)}`);
 assert.ok(dateLayout.scrollWidth<=dateLayout.clientWidth,`Crucible date should fit at 390px: ${JSON.stringify(dateLayout)}`);
 const crucibleTitle=page.locator('.topbar:has(.dashboardActions) h2');
 const titleSize=Number.parseFloat(await crucibleTitle.evaluate((el)=>getComputedStyle(el).fontSize));
 assert.ok(titleSize<=21,'Crucible mobile title should use the compact size');
 const warlock=page.locator('.dashboardActions .warlockMobile');
 const newOrder=page.locator('.dashboardActions button',{hasText:'+ New Work Order'});
 assert.equal(await warlock.isVisible(),true);
 const [warlockBox,orderBox]=await Promise.all([warlock.boundingBox(),newOrder.boundingBox()]);
 assert.ok(warlockBox && orderBox);
 assert.ok(Math.abs(warlockBox.y-orderBox.y)<2,'Warlock and New Work Order should share one row');
 const museum=page.getByRole('link',{name:'Enter The Museum',exact:true});
 const museumBox=await museum.boundingBox();
 assert.ok(museumBox && museumBox.width<=40 && museumBox.height<=40,'Museum portal should be a discreet mobile sigil');
 assert.equal((await museum.textContent())?.trim(),'✦');

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