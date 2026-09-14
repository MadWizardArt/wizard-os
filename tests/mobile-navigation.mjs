import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
const browser = await chromium.launch({headless:true});
try {
 const page = await browser.newPage({viewport:{width:390,height:844}});
 const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:3000';
 await page.goto(base);
 await page.getByRole('button',{name:'☰ Menu',exact:true}).click();
 const menu=page.getByRole('dialog',{name:'Explore Wizard OS'});
 await menu.waitFor({state:'visible'});
 const labels=(await menu.getByRole('link').allTextContents()).map(label=>label.replace('›','').trim());
 assert.equal(labels.length,10);
 assert.equal(labels.includes('Queue'),false);
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
 for(const name of ['Inventory & Sold','Campaigns','Calendar','The Museum','Warlock']) {
  await page.getByRole('button',{name:'☰ Menu',exact:true}).click();
  await Promise.all([page.waitForEvent('load'),menu.getByRole('link',{name,exact:true}).click()]);
  await page.getByRole('button',{name:'☰ Menu',exact:true}).waitFor();
 }
 await page.setViewportSize({width:1280,height:900});
 assert.equal(await page.getByRole('button',{name:'☰ Menu',exact:true}).isVisible(),false);
 console.log('Mobile navigation: simplified destinations, project route, ordering, active state, Escape and desktop visibility passed.');
} finally { await browser.close(); }