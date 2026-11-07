import { chromium } from 'playwright'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const ctx = await browser.newContext({ viewport: { width: 1440, height: 940 } })
const page = await ctx.newPage()
await page.goto('http://127.0.0.1:5173/#/dashboard')
await page.waitForTimeout(2600)
await page.goto('http://127.0.0.1:5173/#/parts')
await page.waitForTimeout(1500)
const info = await page.evaluate(() => ({
  checkboxCount: document.querySelectorAll('.n-checkbox').length,
  selectionCells: document.querySelectorAll('.n-data-table-td--selection').length,
  firstRowCells: document.querySelectorAll('.n-data-table-tbody .n-data-table-tr')[0]?.children.length,
  thTexts: [...document.querySelectorAll('.n-data-table-th')].map(e => e.textContent.trim())
}))
console.log(JSON.stringify(info, null, 2))
await browser.close()
