import { chromium } from 'playwright'
const BASE = 'http://127.0.0.1:5173'
const OUT = 'C:/Users/zhang/Desktop/Project/Leeco PartsHub/dev/.shots'
const b = await chromium.launch({ channel: 'chrome', headless: true })
const m = await (await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1.25 })).newPage()
const errs = []
m.on('pageerror', e => errs.push(e.message))
await m.goto(BASE + '/#/projects'); await m.waitForTimeout(2400)
await m.evaluate(() => { const el = document.querySelector('.content'); if (el) el.scrollTop = 620 })
await m.waitForTimeout(600)
await m.screenshot({ path: `${OUT}/p4-m-projects-table.png` })
const info = await m.evaluate(() => {
  const t = document.querySelector('.n-data-table')
  const wrap = document.querySelector('.n-data-table-base-table')
  return { table: t?.getBoundingClientRect().width, wrap: wrap?.clientWidth, scroll: wrap?.scrollWidth, bodyW: document.body.scrollWidth }
})
console.log(JSON.stringify(info))
console.log('errors:', errs.length ? errs.join(' | ') : 'none')
await b.close()
