import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
const options = { headless: true };
if (process.env.CHROME_PATH) {
  options.executablePath = process.env.CHROME_PATH;
  options.args = [
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--no-zygote",
    "--single-process",
    "--in-process-gpu", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader",
  ];
}
const browser = await chromium.launch(options);
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    timezoneId: "Asia/Tokyo",
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://127.0.0.1:3000/campaigns");
  await page
    .getByRole("heading", { name: "End-of-September Studio Sale", exact: true })
    .waitFor();
  await page
    .getByRole("heading", { name: "End-of-September Studio Sale", exact: true })
    .click();
  await page.getByRole("tab", { name: "Tasks", exact: true }).click();
  await page
    .getByRole("button", { name: /Persistence acceptance task/ })
    .click();
  await page
    .getByLabel("Task", { exact: true })
    .fill("Reload verified preparation");
  await page.getByLabel("Due date", { exact: true }).fill("2026-09-22");
  await page
    .getByLabel("Optional time · Eastern", { exact: true })
    .fill("14:15");
  await page.getByLabel("Completed", { exact: true }).uncheck();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page.reload();
  await page.getByRole("tab", { name: "Tasks", exact: true }).click();
  await page
    .getByRole("button", { name: /Reload verified preparation/ })
    .waitFor();
  assert.ok(
    (
      await page
        .getByRole("button", { name: /Reload verified preparation/ })
        .textContent()
    ).includes("2026-09-22 at 14:15 ET"),
  );
  await page.getByRole("tab", { name: "Artwork", exact: true }).click();
  await page
    .getByRole("heading", { name: "TEST painting", exact: true })
    .waitFor();
  assert.ok(
    (await page.locator(".workspace").textContent()).includes(
      "Sold · unavailable in every campaign",
    ),
  );
  await page.goto("http://127.0.0.1:3000/calendar");
  await page.getByLabel("Calendar month").fill("2026-09");
  await page
    .getByRole("button", { name: /14:15 Reload verified preparation/ })
    .click();
  await page.getByLabel("Due date", { exact: true }).fill("2026-09-21");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page.reload();
  await page.getByLabel("Calendar month").fill("2026-09");
  assert.ok(
    await page
      .locator(".salesDay")
      .filter({ has: page.locator('time[datetime="2026-09-21"]') })
      .getByRole("button", { name: /Reload verified preparation/ })
      .count(),
  );
  assert.equal(
    await page
      .locator(".salesWindow")
      .filter({ hasText: "End-of-September Studio Sale" })
      .count(),
    6,
  );
  await page.screenshot({
    path: "/tmp/wizard-calendar-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Agenda", exact: true }).click();
  await page
    .getByRole("button", { name: /Reload verified preparation/ })
    .last()
    .click();
  await page.getByLabel("Completed", { exact: true }).check();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page.goto(
    "http://127.0.0.1:3000/campaigns?campaign=studio-september-2026",
  );
  await page.getByRole("tab", { name: "Tasks", exact: true }).click();
  await page
    .getByRole("button", { name: /Reload verified preparation/ })
    .waitFor();
  assert.ok(
    await page
      .getByRole("checkbox", {
        name: "Complete Reload verified preparation",
        exact: true,
      })
      .isChecked(),
  );
  await page.getByRole("tab", { name: "Content", exact: true }).click();
  await page
    .getByRole("button", { name: "New Facebook draft", exact: true })
    .click();
  await page
    .getByLabel("Draft title", { exact: true })
    .fill("Test planning only");
  await page
    .getByLabel("Facebook text", { exact: true })
    .fill("Draft copy stays editable.");
  await page
    .getByLabel("Intended posting date", { exact: true })
    .fill("2026-09-24");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page.reload();
  await page.getByRole("tab", { name: "Content", exact: true }).click();
  await page.getByText("Draft copy stays editable.", { exact: true }).waitFor();
  await page.goto("http://127.0.0.1:3000/campaigns");
  await page
    .getByRole("heading", { name: "End-of-September Studio Sale", exact: true })
    .waitFor();
  await page.screenshot({
    path: "/tmp/wizard-campaigns-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "/tmp/wizard-campaigns-mobile.png",
    fullPage: true,
  });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    ),
    false,
  );
  await page.setViewportSize({width:1440,height:1000});
  await page.goto('http://127.0.0.1:3000/inventory');
  await page.getByRole('tab',{name:/Available Inventory/}).waitFor();
  await page.getByRole('button',{name:'Add Painting',exact:true}).click();
  await page.getByLabel('Artwork title',{exact:true}).fill('Direct completed browser painting');
  await page.getByRole('button',{name:'Save',exact:true}).click();
  await page.getByRole('dialog').waitFor({state:'hidden'});
  await page.reload();
  await page.getByRole('heading',{name:'Direct completed browser painting',exact:true}).waitFor();
  await page.goto('http://127.0.0.1:3000/');
  await page.locator('.projectGrid').getByText('2026 Painting Sales — September + Black Friday — $14000 Goal',{exact:true}).waitFor();
  assert.equal(await page.locator('.projectGrid').getByText('Direct completed browser painting',{exact:true}).count(),0);
  await page.goto('http://127.0.0.1:3000/inventory');
  const card=page.locator('article').filter({has:page.getByRole('heading',{name:'Direct completed browser painting',exact:true})});
  await card.getByRole('button',{name:'Record Sale',exact:true}).click();
  await page.getByLabel('Actual artwork selling price AFTER discounts ($)',{exact:true}).fill('250');
  await page.getByRole('button',{name:'Save',exact:true}).click();
  await page.getByRole('dialog').waitFor({state:'hidden'});
  assert.equal(await page.getByRole('heading',{name:'Direct completed browser painting',exact:true}).count(),0);
  await page.reload();
  await page.getByRole('tab',{name:/Sold Archive/}).click();
  await page.getByRole('heading',{name:'Direct completed browser painting',exact:true}).waitFor();
  assert.ok((await card.textContent()).includes('Unpaid'));
  assert.ok((await card.textContent()).includes('Awaiting shipment'));
  assert.ok((await card.textContent()).includes('Provisional profit'));
  await page.screenshot({path:'/tmp/wizard-sold-archive.png',fullPage:true});
  await card.getByRole('button',{name:'Correct status',exact:true}).click();
  await page.getByRole('dialog').getByRole('combobox').first().selectOption('Available');
  await page.getByLabel('Reason (saved in history)',{exact:true}).fill('Browser test return');
  await page.getByRole('button',{name:'Save',exact:true}).click();
  await page.getByRole('dialog').waitFor({state:'hidden'});
  await page.reload();
  await page.getByRole('heading',{name:'Direct completed browser painting',exact:true}).waitFor();
  assert.ok((await card.textContent()).includes('Returned sale'));
  console.log('PASS: browser direct completed entry, WIP exclusion, unpaid sold archive, provisional profit, fulfillment and return persist after reload');
  assert.deepEqual(errors, []);
  console.log(
    "PASS: real browser reload, Eastern dates in Tokyo browser, shared month/agenda task edits, inventory links, six-day sale window, Facebook draft persistence, mobile width",
  );
} finally {
  await browser.close();
}
