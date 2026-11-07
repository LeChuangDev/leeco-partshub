import { chromium } from 'playwright'
import { mkdirSync } from 'fs'
const BASE = 'http://127.0.0.1:5173'
const OUT = 'C:/Users/zhang/Desktop/Project/Leeco PartsHub/dev/.shots'
mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const errors = []

async function run(name, viewport, fn) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1.25 })
  const page = await ctx.newPage()
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[${name}] ` + m.text()) })
  page.on('pageerror', (e) => errors.push(`[${name}] PAGE: ` + e.message))
  await fn(page)
  await ctx.close()
}
async function shot(page, n) { await page.screenshot({ path: `${OUT}/${n}.png` }); console.log('▸', n) }

await run('desk', { width: 1440, height: 940 }, async (page) => {
  await page.goto(BASE + '/#/dashboard'); await page.waitForTimeout(2600)
  await page.goto(BASE + '/#/import'); await page.waitForTimeout(1400); await shot(page, 'r3-import')
  await page.goto(BASE + '/#/locations'); await page.waitForTimeout(1500); await shot(page, 'r3-locations')
  await page.goto(BASE + '/#/backup'); await page.waitForTimeout(1400); await shot(page, 'r3-backup')
  await page.goto(BASE + '/#/parts'); await page.waitForTimeout(1600)
  await page.locator('.n-data-table-tbody .n-data-table-tr').first().click()
  await page.waitForTimeout(1400); await shot(page, 'r3-detail')
  await page.keyboard.press('Escape'); await page.waitForTimeout(400)
  await page.goto(BASE + '/#/bom'); await page.waitForTimeout(1200)
  await page.getByRole('button', { name: '载入示例' }).click(); await page.waitForTimeout(300)
  await page.getByRole('button', { name: '解析并匹配库存' }).click(); await page.waitForTimeout(2200)
  await shot(page, 'r3-bom')
  const ids = await page.evaluate(async () => {
    const r = await fetch('/api/parts?pageSize=8'); const j = await r.json()
    return j.data.list.map(p => p.id)
  })
  await page.goto(`${BASE}/#/labels?ids=${ids.join(',')}`); await page.waitForTimeout(2600)
  await shot(page, 'r3-labels')
})

await run('dark', { width: 1440, height: 940 }, async (page) => {
  await page.addInitScript(() => localStorage.setItem('leeco_theme', 'dark'))
  await page.goto(BASE + '/#/dashboard'); await page.waitForTimeout(2600); await shot(page, 'r3-dark-dash')
  await page.goto(BASE + '/#/parts'); await page.waitForTimeout(1600); await shot(page, 'r3-dark-parts')
})

await run('mobile', { width: 390, height: 844 }, async (page) => {
  await page.goto(BASE + '/#/dashboard'); await page.waitForTimeout(2600); await shot(page, 'r3-m-dash')
  await page.goto(BASE + '/#/parts'); await page.waitForTimeout(1600); await shot(page, 'r3-m-parts')
  await page.goto(BASE + '/#/bom'); await page.waitForTimeout(1400); await shot(page, 'r3-m-bom')
})

console.log('errors:', errors.length ? errors.join('\n') : 'none')
await browser.close()
