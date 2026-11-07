// tests/e2e/ui-smoke.mjs
// 全路由冒烟：确认页面可渲染且控制台无错误（需先启动 npm run dev:all）。
import { chromium } from 'playwright'
const BASE = 'http://127.0.0.1:5173'
const b = await chromium.launch({ channel: 'chrome', headless: true })
const ctx = await b.newContext({ viewport: { width: 1440, height: 940 } })
const p = await ctx.newPage()
const logs = []
p.on('console', m => { if (['error','warning'].includes(m.type())) logs.push(`[${m.type()}] ${m.text()}`) })
p.on('pageerror', e => logs.push('[pageerror] ' + e.message))
const routes = ['dashboard','parts','projects','bom','locations','import','audit','backup','labels']
for (const r of routes) {
  await p.goto(`${BASE}/#/${r}`); await p.waitForTimeout(1500)
  const text = await p.locator('body').innerText()
  console.log(r, text.length, text.includes('Failed') ? 'FAILTEXT' : '')
}
// 打开快速入库与详情
await p.goto(`${BASE}/#/parts`); await p.waitForTimeout(1200)
await p.getByRole('button', { name: '快速入库' }).click(); await p.waitForTimeout(700)
await p.keyboard.press('Escape'); await p.waitForTimeout(300)
await p.locator('.n-data-table-tbody .n-data-table-tr').first().click(); await p.waitForTimeout(900)
console.log('drawer buttons:', await p.locator('.n-drawer button').count())
console.log('logs:', logs.length ? logs.slice(0,12).join('\n') : 'none')
await b.close()
