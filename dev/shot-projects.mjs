import { chromium } from 'playwright'
const BASE = 'http://127.0.0.1:5173'
const OUT = 'C:/Users/zhang/Desktop/Project/Leeco PartsHub/dev/.shots'
const b = await chromium.launch({ channel: 'chrome', headless: true })
const errs = []
async function run(name, viewport, fn) {
  const ctx = await b.newContext({ viewport, deviceScaleFactor: 1.25 })
  const p = await ctx.newPage()
  p.on('pageerror', e => errs.push(`[${name}] ` + e.message))
  p.on('console', m => { if (m.type() === 'error') errs.push(`[${name}] ` + m.text()) })
  await fn(p)
  await ctx.close()
}
async function shot(p, n) { await p.screenshot({ path: `${OUT}/${n}.png` }); console.log('▸', n) }

await run('desk', { width: 1440, height: 940 }, async (p) => {
  await p.goto(BASE + '/#/projects'); await p.waitForTimeout(2600)
  await shot(p, 'p1-projects')
  await p.goto(BASE + '/#/bom'); await p.waitForTimeout(1200)
  await p.getByRole('button', { name: '载入示例' }).click(); await p.waitForTimeout(300)
  await p.getByRole('button', { name: '解析并匹配库存' }).click(); await p.waitForTimeout(2000)
  await shot(p, 'p1-bom')
  await p.goto(BASE + '/#/parts'); await p.waitForTimeout(1600)
  await p.locator('.n-data-table-tbody .n-data-table-tr').first().click(); await p.waitForTimeout(1000)
  await p.getByRole('button', { name: '扫码信息' }).click(); await p.waitForTimeout(900)
  await shot(p, 'p1-qr-modal')
  await p.keyboard.press('Escape'); await p.waitForTimeout(500)
  await p.keyboard.press('Escape'); await p.waitForTimeout(400)
  const ids = await p.evaluate(async () => {
    const r = await fetch('/api/parts?pageSize=6'); const j = await r.json()
    return j.data.list.map(x => x.id)
  })
  await p.goto(`${BASE}/#/labels?ids=${ids.join(',')}`); await p.waitForTimeout(2200)
  await p.getByRole('combobox').first().click().catch(()=>{})
  await p.waitForTimeout(300)
  const opt = p.locator('.n-base-select-option', { hasText: '60 × 40' })
  if (await opt.count()) { await opt.first().click(); await p.waitForTimeout(1600) }
  await shot(p, 'p1-labels-md')
})

await run('mobile', { width: 390, height: 844 }, async (p) => {
  await p.goto(BASE + '/#/projects'); await p.waitForTimeout(2400)
  await shot(p, 'p1-m-projects')
  await p.goto(BASE + '/#/labels?ids=' + (await p.evaluate(async () => {
    const r = await fetch('/api/parts?pageSize=4'); const j = await r.json()
    return j.data.list.map(x => x.id).join(',')
  }))); await p.waitForTimeout(2000)
  await shot(p, 'p1-m-labels')
})
console.log('errors:', errs.length ? errs.join('\n') : 'none')
await b.close()
