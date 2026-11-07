import { chromium } from 'playwright'
const BASE = 'http://127.0.0.1:5173'
const OUT = 'C:/Users/zhang/Desktop/Project/Leeco PartsHub/dev/.shots'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const errors = []
async function run(name, viewport, fn) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1.25 })
  const page = await ctx.newPage()
  page.on('console', m => { if (m.type() === 'error') errors.push(`[${name}] ` + m.text()) })
  page.on('pageerror', e => errors.push(`[${name}] PAGE: ` + e.message))
  await fn(page); await ctx.close()
}
async function shot(p, n) { await p.screenshot({ path: `${OUT}/${n}.png` }); console.log('▸', n) }

await run('desk', { width: 1440, height: 940 }, async (page) => {
  await page.goto(BASE + '/#/dashboard'); await page.waitForTimeout(2800); await shot(page, 'r4-dash')
  await page.goto(BASE + '/#/locations'); await page.waitForTimeout(1800); await shot(page, 'r4-locations')
})
await run('mobile', { width: 390, height: 844 }, async (page) => {
  await page.goto(BASE + '/#/dashboard'); await page.waitForTimeout(2800); await shot(page, 'r4-m-dash')
  await page.goto(BASE + '/#/bom'); await page.waitForTimeout(1500); await shot(page, 'r4-m-bom')
})
await run('print', { width: 1200, height: 1000 }, async (page) => {
  const ids = await page.evaluate(async () => {
    const r = await fetch('/api/parts?pageSize=8'); const j = await r.json()
    return j.data.list.map(p => p.id)
  }).catch(() => [])
  await page.goto(`${BASE}/#/labels?ids=${ids.join(',')}`); await page.waitForTimeout(2400)
  await page.emulateMedia({ media: 'print' }); await page.waitForTimeout(500)
  await shot(page, 'r4-labels-print')
})
console.log('errors:', errors.length ? errors.join('\n') : 'none')
await browser.close()
