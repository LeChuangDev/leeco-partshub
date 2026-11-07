import { chromium } from 'playwright'
import { mkdirSync } from 'fs'
const BASE = 'http://127.0.0.1:5173'
const OUT = 'C:/Users/zhang/Desktop/Project/Leeco PartsHub/dev/.shots'
mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const ctx = await browser.newContext({ viewport: { width: 1440, height: 940 }, deviceScaleFactor: 1.25 })
const page = await ctx.newPage()
const errors = []
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', (e) => errors.push('PAGE: ' + e.message))
async function shot(n) { await page.screenshot({ path: `${OUT}/${n}.png` }); console.log('▸', n) }
await page.goto(BASE + '/#/dashboard'); await page.waitForTimeout(2800)
await shot('r2-dashboard')
await page.goto(BASE + '/#/parts?filter=low'); await page.waitForTimeout(1600)
await shot('r2-parts')
const ids = await page.evaluate(async () => {
  const r = await fetch('/api/parts?pageSize=5'); const j = await r.json()
  return j.data.list.map(p => p.id)
})
await page.goto(`${BASE}/#/labels?ids=${ids.join(',')}`); await page.waitForTimeout(2400)
await shot('r2-labels')
console.log('errors:', errors.length ? errors.join('\n') : 'none')
await browser.close()
