// dev/ui-efficiency.mjs
// 验证 P2 效率工具：全局快捷键、扫码、右键菜单、可自定义看板。
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { buildPartQrText } from '../shared/qr.js'

const BASE = 'http://127.0.0.1:5173'
const API = 'http://127.0.0.1:8787'
const SHOTS = 'dev/shots'
mkdirSync(SHOTS, { recursive: true })

const b = await chromium.launch({ channel: 'chrome', headless: true })
const ctx = await b.newContext({ viewport: { width: 1440, height: 940 }, locale: 'zh-CN' })
const p = await ctx.newPage()
const errs = []
p.on('pageerror', (e) => errs.push('pageerror: ' + e.message))
p.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()) })
const log = (...a) => console.log(...a)
const wait = (ms) => p.waitForTimeout(ms)
const closeModal = async () => {
  const x = p.locator('.n-modal .n-base-close').last()
  if (await x.count()) await x.click().catch(() => {})
  else await p.keyboard.press('Escape')
  await wait(400)
}

// 取一条真实器件与其二维码文本
const listJson = await (await fetch(`${API}/api/parts?pageSize=1`)).json()
const partId = listJson.data.list[0].id
const partJson = await (await fetch(`${API}/api/parts?id=${partId}`)).json()
const part = partJson.data
const qrText = buildPartQrText(part, { quantity: part.totalQuantity, mode: 'full' })
log('测试器件:', part.name, '| 库存:', part.totalQuantity)

await p.goto(BASE + '/#/dashboard')
await wait(2600)
const dashWidgets = () => p.locator('.widget').count()
log('看板卡片数:', await dashWidgets())
await p.screenshot({ path: `${SHOTS}/dash-light.png` })

// 1) 自定义看板：排序 / 移除 / 添加 / 宽度 / 持久化
await p.getByRole('button', { name: '自定义' }).click()
await wait(500)
log('编辑模式提示:', await p.locator('.edit-bar').isVisible())
await p.screenshot({ path: `${SHOTS}/dash-edit.png` })

const trend = p.locator('.widget', { hasText: '出入库趋势' }).first()
const beforeSpan = await trend.locator('.w-ctl').first().innerText()
await trend.locator('.w-ctl').first().click()
await wait(300)
const afterSpan = await trend.locator('.w-ctl').first().innerText()
log('宽度切换:', beforeSpan.trim(), '→', afterSpan.trim())

const stale = p.locator('.widget', { hasText: '呆滞物料' }).first()
await stale.locator('.w-ctl.danger').click()
await wait(400)
log('移除呆滞后卡片数:', await dashWidgets())

await p.getByRole('button', { name: '添加卡片' }).first().click()
await wait(500)
await p.locator('.wpal-item', { hasText: '呆滞物料' }).click()
await wait(300)
await p.locator('.n-modal').last().getByRole('button', { name: '完成' }).click()
await wait(500)
log('重新添加后卡片数:', await dashWidgets())

await p.reload()
await wait(2600)
const titles = await p.locator('.widget .w-title').allInnerTexts()
log('刷新后卡片顺序:', titles.join(' / '))
log('布局持久化:', titles.length === 9 && titles[titles.length - 1] === '呆滞物料')

await p.getByRole('button', { name: '自定义' }).click()
await wait(300)
await p.locator('.edit-reset').click()
await wait(500)
await p.getByRole('button', { name: '完成' }).click()
await wait(400)

// 2) Ctrl+K 命令面板
await p.keyboard.press('Control+K')
await wait(600)
log('命令面板打开:', await p.locator('.cmdk-mask').isVisible())
log('面板含快捷操作:', (await p.locator('.cmdk-body').innerText()).includes('快速入库'))
await p.locator('.cmdk-input input').fill('10k')
await wait(800)
const paletteText = await p.locator('.cmdk-body').innerText()
log('搜索 10k 命中:', paletteText.includes('10kΩ') || paletteText.includes('10k'))
await p.screenshot({ path: `${SHOTS}/palette.png` })
await p.keyboard.press('Escape')
await wait(400)

// 3) Ctrl+S 扫码：多行二维码文本识别 + 入库/出库
await p.keyboard.press('Control+S')
await wait(700)
log('扫码弹窗打开:', await p.locator('.scan-input textarea').isVisible())
const ta = p.locator('.scan-input textarea')
await ta.fill(qrText)
await ta.press('Enter')
await wait(1200)
const scanCard = p.locator('.scan-card').first()
log('扫码识别到器件:', await scanCard.isVisible())
const scanTxt = (await scanCard.innerText()).replace(/\s+/g, ' ')
log('识别内容含名称/库存:', scanTxt.includes(part.name), scanTxt.slice(0, 90))
await p.screenshot({ path: `${SHOTS}/scan.png` })

const stockOf = async () => Number((await p.locator('.sc-stock b').first().innerText()).replace(/[^\d]/g, ''))
const s0 = await stockOf()
await scanCard.getByRole('button', { name: '入库' }).click()
await wait(1500)
const s1 = await stockOf()
await scanCard.getByRole('button', { name: '出库' }).click()
await wait(1500)
const s2 = await stockOf()
log('扫码入库/出库库存:', s0, '→', s1, '→', s2, '| 还原:', s0 + 1 === s1 && s2 === s0)
await closeModal()

// 4) Ctrl+I 快速入库
await p.keyboard.press('Control+I')
await wait(700)
const quickOpen = await p.locator('.n-modal', { hasText: '快速入库' }).first().isVisible().catch(() => false)
log('快速入库弹窗:', quickOpen)
await closeModal()

// 5) ? 快捷键说明
await p.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: '?', bubbles: true })))
await wait(600)
log('快捷键面板:', await p.locator('.kb-body').isVisible())
await p.screenshot({ path: `${SHOTS}/shortcut.png` })
await closeModal()

// 6) 元器件右键菜单
await p.goto(BASE + '/#/parts')
await wait(2200)
const firstRow = p.locator('.n-data-table-tbody .n-data-table-tr').first()
await firstRow.click({ button: 'right' })
await wait(500)
const ctxVisible = await p.locator('.ctx-panel').isVisible()
const ctxText = (await p.locator('.ctx-panel').innerText()).replace(/\s+/g, ' ')
log('器件右键菜单:', ctxVisible, '|', ctxText.slice(0, 80))
log('菜单含移动位置:', ctxText.includes('移动存放位置'), '| 含扫码信息:', ctxText.includes('扫码信息'))
await p.screenshot({ path: `${SHOTS}/ctx-parts.png` })
await p.locator('.ctx-item', { hasText: '查看详情与批次' }).click()
await wait(1300)
log('详情抽屉打开:', await p.locator('.n-drawer').isVisible())

const batchRow = p.locator('.batch-wrap tbody tr').first()
if (await batchRow.count()) {
  await batchRow.click({ button: 'right' })
  await wait(500)
  const bTxt = (await p.locator('.ctx-panel').innerText()).replace(/\s+/g, ' ')
  log('批次右键菜单含指定批次出库:', bTxt.includes('从该批次出库'))
  await p.screenshot({ path: `${SHOTS}/ctx-batch.png` })
  await p.keyboard.press('Escape')
  await wait(300)
}
await closeModal()
await wait(400)

// 右键 → 移动位置弹窗（取消，不改数据）
await firstRow.click({ button: 'right' })
await wait(400)
await p.locator('.ctx-item', { hasText: '移动存放位置' }).click()
await wait(700)
const moveTxt = (await p.locator('.n-modal', { hasText: '移动存放位置' }).first().innerText()).replace(/\s+/g, ' ')
log('移动位置弹窗:', moveTxt.includes('不改变库存数量'))
await p.locator('.n-modal').last().getByRole('button', { name: '取消' }).click()
await wait(400)

// 7) 位置右键菜单
await p.goto(BASE + '/#/locations')
await wait(1800)
await p.locator('.tree-label').first().click({ button: 'right' })
await wait(500)
const locCtx = (await p.locator('.ctx-panel').innerText()).replace(/\s+/g, ' ')
log('位置右键菜单含复制路径:', locCtx.includes('复制位置路径'), '| 含新建子位置:', locCtx.includes('新建子位置'))
await p.screenshot({ path: `${SHOTS}/ctx-location.png` })
await p.keyboard.press('Escape')
await wait(300)

// 8) 移动端
const mctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'zh-CN' })
const mp = await mctx.newPage()
mp.on('pageerror', (e) => errs.push('mobile pageerror: ' + e.message))
await mp.goto(BASE + '/#/dashboard')
await mp.waitForTimeout(2600)
await mp.screenshot({ path: `${SHOTS}/dash-mobile.png` })
const overflow = await mp.evaluate(() => {
  const el = document.querySelector('.content')
  return el ? { scroll: el.scrollWidth, client: el.clientWidth } : null
})
log('移动端看板卡片数:', await mp.locator('.widget').count(), '| 内容横向溢出:', overflow)
await mctx.close()

log('控制台错误数:', errs.length)
for (const e of errs.slice(0, 8)) log('  -', e)
await b.close()
