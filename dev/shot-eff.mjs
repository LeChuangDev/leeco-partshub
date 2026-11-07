import { chromium } from 'playwright'
const BASE = 'http://127.0.0.1:5173'
const b = await chromium.launch({ channel: 'chrome', headless: true })

// 暗色看板
const c1 = await b.newContext({ viewport: { width: 1440, height: 940 }, locale: 'zh-CN' })
await c1.addInitScript(() => localStorage.setItem('leeco_theme', 'dark'))
const p1 = await c1.newPage()
await p1.goto(BASE + '/#/dashboard'); await p1.waitForTimeout(2600)
await p1.screenshot({ path: 'dev/shots/dash-dark.png' })
// 暗色扫码
await p1.keyboard.press('Control+S'); await p1.waitForTimeout(700)
await p1.screenshot({ path: 'dev/shots/scan-dark.png' })
await c1.close()

// 1280 窄桌面
const c2 = await b.newContext({ viewport: { width: 1280, height: 900 }, locale: 'zh-CN' })
const p2 = await c2.newPage()
await p2.goto(BASE + '/#/dashboard'); await p2.waitForTimeout(2600)
await p2.screenshot({ path: 'dev/shots/dash-1280.png' })
// 编辑态在 390 宽度
await c2.close()

const c3 = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'zh-CN' })
const p3 = await c3.newPage()
await p3.goto(BASE + '/#/dashboard'); await p3.waitForTimeout(2500)
await p3.getByRole('button', { name: '自定义' }).click(); await p3.waitForTimeout(500)
await p3.screenshot({ path: 'dev/shots/dash-mobile-edit.png' })
await c3.close()
await b.close()
console.log('ok')
