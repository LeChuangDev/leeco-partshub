import { chromium } from 'playwright'
const BASE = 'http://127.0.0.1:5173'
const OUT = 'C:/Users/zhang/Desktop/Project/Leeco PartsHub/dev/.shots'
const b = await chromium.launch({ channel: 'chrome', headless: true })
const errs = []
async function run(name, viewport, fn, init) {
  const ctx = await b.newContext({ viewport, deviceScaleFactor: 1.25 })
  const p = await ctx.newPage()
  if (init) await p.addInitScript(init)
  p.on('pageerror', e => errs.push(`[${name}] ` + e.message))
  p.on('console', m => { if (m.type() === 'error') errs.push(`[${name}] ` + m.text()) })
  await fn(p)
  await ctx.close()
}
await run('desk', { width: 1440, height: 940 }, async (p) => {
  for (const r of ['dashboard','parts','projects','bom','locations','import','backup']) {
    await p.goto(`${BASE}/#/${r}`); await p.waitForTimeout(1500)
    const len = (await p.locator('body').innerText()).length
    console.log(r, len)
  }
  await p.goto(BASE + '/#/projects'); await p.waitForTimeout(1800)
  await p.screenshot({ path: `${OUT}/f2-projects.png` })
})
await run('dark', { width: 1440, height: 940 }, async (p) => {
  await p.goto(BASE + '/#/projects'); await p.waitForTimeout(2400)
  await p.screenshot({ path: `${OUT}/f2-dark-projects.png` })
}, () => localStorage.setItem('leeco_theme', 'dark'))
await run('mobile', { width: 390, height: 844 }, async (p) => {
  await p.goto(BASE + '/#/projects'); await p.waitForTimeout(2200)
  await p.evaluate(() => { const el = document.querySelector('.content'); if (el) el.scrollTop = 700 })
  await p.waitForTimeout(400)
  await p.screenshot({ path: `${OUT}/f2-m-projects.png` })
})
console.log('errors:', errs.length ? errs.join('\n') : 'none')
await b.close()
