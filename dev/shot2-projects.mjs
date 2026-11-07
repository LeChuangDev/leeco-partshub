import { chromium } from 'playwright'
const BASE = 'http://127.0.0.1:5173'
const OUT = 'C:/Users/zhang/Desktop/Project/Leeco PartsHub/dev/.shots'
const b = await chromium.launch({ channel: 'chrome', headless: true })
const errs = []
const p = await (await b.newContext({ viewport: { width: 1440, height: 940 }, deviceScaleFactor: 1.25 })).newPage()
p.on('pageerror', e => errs.push(e.message))
p.on('console', m => { if (m.type() === 'error') errs.push(m.text()) })
await p.goto(BASE + '/#/dashboard'); await p.waitForTimeout(2000)
const ids = await p.evaluate(async () => {
  const r = await fetch('/api/parts?pageSize=6'); const j = await r.json()
  return j.data.list.map(x => x.id)
})
await p.goto(`${BASE}/#/labels?ids=${ids.join(',')}`); await p.waitForTimeout(2200)
await p.locator('.lp-bar .n-select').click(); await p.waitForTimeout(500)
await p.locator('.n-base-select-option', { hasText: '60 × 40' }).click(); await p.waitForTimeout(1800)
const box = await p.locator('.sheet').boundingBox()
await p.screenshot({ path: `${OUT}/p2-labels-md.png`, clip: { x: box.x, y: box.y, width: Math.min(box.width, 700), height: 330 } })
console.log('md label size ok:', JSON.stringify(await p.locator('.label').first().boundingBox()))
await p.goto(BASE + '/#/bom'); await p.waitForTimeout(1200)
await p.getByRole('button', { name: '载入示例' }).click(); await p.waitForTimeout(300)
await p.getByRole('button', { name: '解析并匹配库存' }).click(); await p.waitForTimeout(2000)
await p.getByRole('button', { name: '保存为项目' }).click(); await p.waitForTimeout(700)
await p.screenshot({ path: `${OUT}/p2-save-project.png` })
await p.getByRole('button', { name: '取消' }).click(); await p.waitForTimeout(400)
console.log('errors:', errs.length ? errs.join(' | ') : 'none')

const m = await (await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1.25 })).newPage()
m.on('pageerror', e => errs.push('m:' + e.message))
await m.goto(BASE + '/#/projects'); await m.waitForTimeout(2400)
await m.screenshot({ path: `${OUT}/p2-m-projects-full.png`, fullPage: true })
const ov = await m.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }))
console.log('mobile overflow', JSON.stringify(ov))
await b.close()
