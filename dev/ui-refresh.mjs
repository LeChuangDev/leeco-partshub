import { chromium } from 'playwright'
import { buildPartQrText } from '../shared/qr.js'
const API = 'http://127.0.0.1:8787'
const b = await chromium.launch({ channel: 'chrome', headless: true })
const p = await (await b.newContext({ viewport: { width: 1440, height: 940 }, locale: 'zh-CN' })).newPage()
const errs = []
p.on('pageerror', e => errs.push(e.message))
p.on('console', m => { if (m.type() === 'error') errs.push(m.text()) })
const list = await (await fetch(`${API}/api/parts?pageSize=1`)).json()
const part = (await (await fetch(`${API}/api/parts?id=${list.data.list[0].id}`)).json()).data
const qr = buildPartQrText(part, { quantity: part.totalQuantity, mode: 'full' })

await p.goto('http://127.0.0.1:5173/#/dashboard'); await p.waitForTimeout(2500)
const total = async () => (await p.locator('.widget', { hasText: '库存概览' }).locator('.stat').nth(1).innerText()).replace(/\s+/g, ' ')
console.log('before:', await total())

await p.locator('.kb-trigger').click(); await p.waitForTimeout(500)
console.log('header 快捷键按钮:', await p.locator('.kb-body').isVisible())
await p.keyboard.press('Escape'); await p.waitForTimeout(300)

await p.keyboard.press('Control+S'); await p.waitForTimeout(600)
await p.locator('.scan-input textarea').fill(qr)
await p.locator('.scan-input textarea').press('Enter')
await p.waitForTimeout(1200)
await p.locator('.scan-card').getByRole('button', { name: '入库' }).click()
await p.waitForTimeout(1500)
console.log('scan stock after in:', await p.locator('.sc-stock b').first().innerText())
await p.locator('.n-modal .n-base-close').last().click(); await p.waitForTimeout(1000)
console.log('dashboard after  (应自动刷新):', await total())

await p.keyboard.press('Control+S'); await p.waitForTimeout(600)
await p.locator('.scan-input textarea').fill(qr)
await p.locator('.scan-input textarea').press('Enter')
await p.waitForTimeout(1200)
await p.locator('.scan-card').getByRole('button', { name: '出库' }).click()
await p.waitForTimeout(1500)
await p.locator('.n-modal .n-base-close').last().click(); await p.waitForTimeout(1000)
console.log('dashboard restored:', await total())
console.log('errors:', errs.length, errs.slice(0, 3))
await b.close()
