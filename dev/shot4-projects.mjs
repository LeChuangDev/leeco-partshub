import { chromium } from 'playwright'
const BASE = 'http://127.0.0.1:5173'
const OUT = 'C:/Users/zhang/Desktop/Project/Leeco PartsHub/dev/.shots'
const b = await chromium.launch({ channel: 'chrome', headless: true })
const p = await (await b.newContext({ viewport: { width: 1440, height: 940 }, deviceScaleFactor: 1.25 })).newPage()
const errs = []
p.on('pageerror', e => errs.push(e.message))
p.on('console', m => { if (m.type() === 'error') errs.push(m.text()) })
await p.goto(BASE + '/#/dashboard'); await p.waitForTimeout(2000)
const ids = await p.evaluate(async () => {
  const r = await fetch('/api/parts?pageSize=6'); const j = await r.json()
  return j.data.list.map(x => x.id)
})
await p.goto(`${BASE}/#/labels?ids=${ids.join(',')}`); await p.waitForTimeout(2200)
await p.locator('.lp-bar .n-select').first().click(); await p.waitForTimeout(400)
await p.locator('.n-base-select-option', { hasText: '60 × 40' }).click(); await p.waitForTimeout(1600)
await p.locator('.lp-bar .n-select').first().click(); await p.waitForTimeout(400)
await p.locator('.n-base-select-option', { hasText: '完整' }).click(); await p.waitForTimeout(1800)
const box = await p.locator('.sheet').boundingBox()
await p.screenshot({ path: `${OUT}/p7-labels-full.png`, clip: { x: box.x, y: box.y, width: 700, height: 200 } })
console.log('errors:', errs.length ? errs.join(' | ') : 'none')
await b.close()
