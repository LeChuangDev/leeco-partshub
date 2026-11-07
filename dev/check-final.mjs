import { chromium } from 'playwright'
const b = await chromium.launch({ channel: 'chrome', headless: true })
const p = await (await b.newContext({ viewport: { width: 1440, height: 940 }, deviceScaleFactor: 1.25 })).newPage()
const errs = []
p.on('pageerror', e => errs.push(e.message))
p.on('console', m => { if (m.type() === 'error') errs.push(m.text()) })
await p.goto('http://127.0.0.1:5173/#/projects'); await p.waitForTimeout(2600)
await p.screenshot({ path: 'C:/Users/zhang/Desktop/Project/Leeco PartsHub/dev/.shots/f4-projects.png' })
console.log('rows', await p.locator('.n-data-table-tbody .n-data-table-tr').count())
console.log('errors', errs.length ? errs.join(' | ') : 'none')
await b.close()
