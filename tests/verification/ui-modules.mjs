// tests/verification/ui-modules.mjs
// 逐模块前端验证：真实浏览器打开每个模块页面，核对关键元素、全局交互、主题与移动端。
// 只读操作，不写演示库。运行前需启动 npm run dev:all。
// 运行：npm run verify:ui

import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const BASE = 'http://127.0.0.1:5173'
const SHOTS = 'tests/.artifacts/modules'
mkdirSync(SHOTS, { recursive: true })

const MODULES = [
  { key: 'dashboard', name: '总览看板', path: '/#/dashboard', selector: '.widget', keyword: '库存' },
  { key: 'parts', name: '元器件管理', path: '/#/parts', selector: '.n-data-table', keyword: '元器件' },
  { key: 'projects', name: '项目 BOM', path: '/#/projects', selector: '.prj-kpis', keyword: '齐套' },
  { key: 'bom', name: 'BOM 齐套', path: '/#/bom', selector: 'textarea', keyword: 'BOM' },
  { key: 'locations', name: '存储位置', path: '/#/locations', selector: '.n-tree', keyword: '位置' },
  { key: 'import', name: '订单导入', path: '/#/import', selector: '.n-upload', keyword: '导入' },
  { key: 'audit', name: '操作日志', path: '/#/audit', selector: '.audit-table', keyword: '日志' },
  { key: 'backup', name: '备份与设置', path: '/#/backup', selector: '.section', keyword: '备份' },
  { key: 'labels', name: '标签打印', path: '/#/labels', selector: '.lp-bar', keyword: '标签' }
]

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const ctx = await browser.newContext({ viewport: { width: 1440, height: 940 }, locale: 'zh-CN' })
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()) })

let passed = 0
let failed = 0
function ok(name, cond, detail = '') {
  if (cond) { passed++; console.log(`  ✓ ${name}`) }
  else { failed++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const wait = (ms) => page.waitForTimeout(ms)
const text = () => page.locator('body').innerText()

console.log('== UI 逐模块渲染 ==')
for (const m of MODULES) {
  const before = errors.length
  await page.goto(BASE + m.path)
  await wait(m.key === 'labels' ? 2200 : 1300)
  const body = await text()
  const count = await page.locator(m.selector).count().catch(() => 0)
  ok(`${m.name}：页面渲染与关键词`, body.length > 80 && body.includes(m.keyword), `文本长度 ${body.length}`)
  ok(`${m.name}：关键组件 ${m.selector}`, count > 0, `命中 ${count}`)
  ok(`${m.name}：无控制台错误`, errors.length === before, errors.slice(before).join(' | '))
  await page.screenshot({ path: `${SHOTS}/${m.key}.png` })
}

console.log('\n== UI 全局交互 ==')
await page.goto(BASE + '/#/dashboard')
await wait(1300)
await page.keyboard.press('Control+K')
await wait(500)
ok('Ctrl+K 打开命令面板', await page.locator('.cmdk-mask').isVisible())
await page.keyboard.press('Escape')
await wait(300)

await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: '?', bubbles: true })))
await wait(500)
ok('? 打开快捷键说明', await page.locator('.kb-body').isVisible())
await page.keyboard.press('Escape')
await wait(300)

await page.keyboard.press('Control+I')
await wait(600)
ok('Ctrl+I 打开快速入库', await page.locator('.n-modal', { hasText: '快速入库' }).first().isVisible().catch(() => false))
await page.keyboard.press('Escape')
await wait(300)

await page.keyboard.press('Control+S')
await wait(600)
ok('Ctrl+S 打开扫码操作', await page.locator('.scan-input textarea').isVisible())
await page.keyboard.press('Escape')
await wait(300)

await page.goto(BASE + '/#/parts')
await wait(1600)
const firstRow = page.locator('.n-data-table-tbody .n-data-table-tr').first()
if (await firstRow.count()) {
  await firstRow.click({ button: 'right' })
  await wait(400)
  ok('元器件行右键菜单', await page.locator('.ctx-panel').isVisible())
  await page.keyboard.press('Escape')
} else {
  ok('元器件行右键菜单', false, '表格无数据行')
}

const themeBefore = await page.evaluate(() => document.documentElement.dataset.theme)
await page.locator('button[aria-label*="主题"]').click()
await wait(400)
const themeAfter = await page.evaluate(() => document.documentElement.dataset.theme)
ok('明暗主题切换', themeBefore !== themeAfter, `${themeBefore} → ${themeAfter}`)
await page.locator('button[aria-label*="主题"]').click()
await wait(300)

console.log('\n== UI 移动端与登录页 ==')
const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, locale: 'zh-CN' })
const mp = await mobile.newPage()
const mobileErrors = []
mp.on('pageerror', (e) => mobileErrors.push(e.message))
for (const path of ['/#/dashboard', '/#/parts', '/#/audit']) {
  await mp.goto(BASE + path)
  await mp.waitForTimeout(1200)
  const over = await mp.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }))
  ok(`390px ${path} 无横向溢出`, over.scroll === over.client, JSON.stringify(over))
}
await mp.screenshot({ path: `${SHOTS}/mobile-dashboard.png` })
await mobile.close()

const loginCtx = await browser.newContext({ viewport: { width: 1440, height: 940 }, locale: 'zh-CN' })
await loginCtx.route('**/api/auth/check', (route) => route.fulfill({
  status: 401, contentType: 'application/json',
  body: JSON.stringify({ code: 401, data: { authenticated: false }, msg: 'Unauthorized' })
}))
const loginPage = await loginCtx.newPage()
await loginPage.goto(BASE + '/#/login')
await loginPage.waitForTimeout(900)
ok('登录页品牌与输入框', await loginPage.locator('h1.title').isVisible() && await loginPage.locator('.n-input').count() > 0)
await loginPage.screenshot({ path: `${SHOTS}/login.png` })
await loginCtx.close()

ok('全程无控制台错误', errors.length === 0 && mobileErrors.length === 0,
  [...errors, ...mobileErrors].slice(0, 3).join(' | '))

await browser.close()
console.log(`\n========== UI 模块验证: ${MODULES.length} 个页面, ${passed} 通过, ${failed} 失败 ==========`)
process.exit(failed === 0 ? 0 : 1)
