import { chromium } from 'playwright'
const b = await chromium.launch({ channel: 'chrome', headless: true })
const p = await (await b.newContext({ viewport: { width: 1440, height: 940 }, deviceScaleFactor: 2 })).newPage()
await p.goto('http://127.0.0.1:5173/#/locations'); await p.waitForTimeout(2400)
await p.locator('.side').screenshot({ path: 'dev/.shots/x-loc-tree.png' })
await p.locator('.loc-facts').screenshot({ path: 'dev/.shots/x-loc-facts.png' })
await b.close()
