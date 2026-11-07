// tests/e2e/ui-report-improvements.mjs
// 报告改进后的界面验收：品牌标记、操作日志（明暗/移动/筛选）、恢复确认流程。
// 运行前需启动 npm run dev:all。

import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const BASE = 'http://127.0.0.1:5173'
const API = 'http://127.0.0.1:8787/api'
const SHOTS = 'tests/.artifacts'
mkdirSync(SHOTS, { recursive: true })

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const errors = []
const log = (...a) => console.log(...a)

async function newPage(options = {}) {
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 940 },
    locale: 'zh-CN',
    ...options
  })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()) })
  return { ctx, page }
}

const { ctx, page } = await newPage()
const wait = (ms) => page.waitForTimeout(ms)

// ---------- 品牌标记 ----------
await page.goto(`${BASE}/#/dashboard`)
await wait(1800)
const markPaths = await page.locator('.brand-mark svg path').count()
const markRects = await page.locator('.brand-mark svg rect').count()
const markGradients = await page.locator('.brand-mark svg linearGradient').count()
const markBg = await page.locator('.brand-mark').first().evaluate((el) => getComputedStyle(el).backgroundImage)
const brandName = await page.locator('.sider .brand-text .b1').innerText()
const brandEnglish = await page.locator('.sider .brand-text .b2').innerText()
log('品牌标记几何元素:', `路径 ${markPaths} / 元件 ${markRects} / 渐变 ${markGradients}`)
log('标记仅两个图形且无渐变:', markPaths === 1 && markRects === 1 && markGradients === 0 && markBg === 'none')
log('品牌主名:', brandName, '| 英文副标:', brandEnglish, '| 页面标题:', await page.title())
log('品牌名不含旧称:', !brandName.includes('元件仓') && !brandEnglish.includes('PARTSHUB'))
await page.locator('.sider .brand').screenshot({ path: `${SHOTS}/brand-mark.png` })
await page.screenshot({ path: `${SHOTS}/report-dashboard.png` })
const markCtx = await browser.newContext({ viewport: { width: 1440, height: 940 }, deviceScaleFactor: 2, locale: 'zh-CN' })
const markPage = await markCtx.newPage()
await markPage.goto(`${BASE}/#/dashboard`)
await markPage.waitForTimeout(1300)
await markPage.locator('.sider .brand-mark').screenshot({ path: `${SHOTS}/brand-mark-2x.png` })
await markCtx.close()

// 登录页品牌区：拦截鉴权查询，使页面停留在登录态便于核对名称
const loginCtx = await browser.newContext({ viewport: { width: 1440, height: 940 }, locale: 'zh-CN' })
await loginCtx.route('**/api/auth/check', (route) => route.fulfill({
  status: 401, contentType: 'application/json',
  body: JSON.stringify({ code: 401, data: { authenticated: false }, msg: 'Unauthorized' })
}))
const loginPage = await loginCtx.newPage()
await loginPage.goto(`${BASE}/#/login`)
await loginPage.waitForTimeout(900)
log('登录页标题:', await loginPage.locator('h1.title').innerText())
await loginPage.screenshot({ path: `${SHOTS}/report-login.png` })
await loginCtx.close()

// ---------- 操作日志 ----------
await page.goto(`${BASE}/#/audit`)
await wait(1500)
const rows = await page.locator('.n-data-table-tbody .n-data-table-tr').count()
log('操作日志行数:', rows)
await page.screenshot({ path: `${SHOTS}/report-audit-light.png` })

// 按动作筛选
await page.locator('.audit-bar .n-base-selection').first().click()
await wait(250)
await page.locator('.n-base-select-option', { hasText: '出库' }).first().click()
await wait(700)
const filtered = await page.locator('.n-data-table-tbody .n-data-table-tr').count()
log('筛选「出库」后行数:', filtered)
const allOut = await page.locator('.n-data-table-tbody .n-data-table-tr').allTextContents()
log('筛选结果只含出库:', allOut.every((t) => t.includes('出库')))

// ---------- 暗色 ----------
await page.evaluate(() => localStorage.setItem('leeco_theme', 'dark'))
await page.reload()
await wait(1500)
await page.screenshot({ path: `${SHOTS}/report-audit-dark.png` })
await page.goto(`${BASE}/#/dashboard`)
await wait(1200)
await page.locator('.sider .brand').screenshot({ path: `${SHOTS}/brand-mark-dark.png` })

// ---------- 恢复确认：必须输入 RESTORE ----------
const snapshot = await (await fetch(`${API}/export/all`)).json()
await page.goto(`${BASE}/#/backup`)
await wait(1200)
const fileInput = page.locator('input[type="file"]').first()
await fileInput.setInputFiles({
  name: 'backup.json',
  mimeType: 'application/json',
  buffer: Buffer.from(JSON.stringify(snapshot.data))
})
await wait(1400)
const modalVisible = await page.locator('.n-modal', { hasText: '确认覆盖恢复' }).count()
log('恢复确认弹窗:', modalVisible > 0)
const confirmBtn = page.locator('.n-modal').getByRole('button', { name: '确认覆盖' })
log('未输入 RESTORE 时按钮禁用:', await confirmBtn.isDisabled())
await page.screenshot({ path: `${SHOTS}/report-restore-confirm.png` })
await page.locator('.n-modal input').fill('RESTORE')
await wait(200)
log('输入 RESTORE 后按钮可用:', await confirmBtn.isEnabled())
await page.locator('.n-modal').getByRole('button', { name: '取消' }).click()
await wait(300)

// ---------- 移动端 ----------
const mobile = await newPage({ viewport: { width: 390, height: 844 }, isMobile: true })
await mobile.page.goto(`${BASE}/#/audit`)
await mobile.page.waitForTimeout(1500)
const overflow = await mobile.page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }))
log('移动端日志页横向溢出:', JSON.stringify(overflow))
await mobile.page.screenshot({ path: `${SHOTS}/report-audit-mobile.png` })
await mobile.page.goto(`${BASE}/#/dashboard`)
await mobile.page.waitForTimeout(1200)
await mobile.page.screenshot({ path: `${SHOTS}/report-dashboard-mobile.png` })

log('控制台错误数:', errors.length, errors.slice(0, 5).join(' | '))
await browser.close()
if (errors.length) process.exit(1)
