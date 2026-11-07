import { chromium } from 'playwright'
const BASE = 'http://127.0.0.1:5173'
const OUT = 'C:/Users/zhang/Desktop/Project/Leeco PartsHub/dev/.shots'
const b = await chromium.launch({ channel: 'chrome', headless: true })
async function run(name, viewport, fn) {
  const ctx = await b.newContext({ viewport, deviceScaleFactor: 1.25 })
  const p = await ctx.newPage()
  const errs = []
  p.on('pageerror', e => errs.push(e.message))
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()) })
  await fn(p)
  console.log(name, 'errors:', errs.length ? errs.join(' | ') : 'none')
  await ctx.close()
}
await run('desk', { width: 1440, height: 940 }, async (p) => {
  await p.goto(BASE + '/#/locations'); await p.waitForTimeout(2200)
  await p.screenshot({ path: `${OUT}/r7-locations.png` })
})
await run('mobile', { width: 390, height: 844 }, async (p) => {
  await p.goto(BASE + '/#/dashboard'); await p.waitForTimeout(2000)
  const ids = await p.evaluate(async () => { const r = await fetch('/api/parts?pageSize=8'); const j = await r.json(); return j.data.list.map(x=>x.id) })
  await p.goto(`${BASE}/#/labels?ids=${ids.join(',')}`); await p.waitForTimeout(2000)
  await p.screenshot({ path: `${OUT}/r7-m-labels.png` })
  await p.goto(BASE + '/#/bom'); await p.waitForTimeout(1400)
  await p.getByRole('button', { name: '载入示例' }).click(); await p.waitForTimeout(300)
  await p.getByRole('button', { name: '解析并匹配库存' }).click(); await p.waitForTimeout(2000)
  await p.screenshot({ path: `${OUT}/r7-m-bom.png` })
})
await b.close()
