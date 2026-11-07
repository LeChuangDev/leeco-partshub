import { chromium } from 'playwright'
import { mkdirSync } from 'fs'

const BASE = 'http://127.0.0.1:5173'
const OUT = 'C:/Users/zhang/Desktop/Project/Leeco PartsHub/dev/.shots'
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const ctx = await browser.newContext({ viewport: { width: 1440, height: 940 }, deviceScaleFactor: 1.25 })
const page = await ctx.newPage()

const errors = []
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', (e) => errors.push('PAGE: ' + e.message))

async function shot(name) {
  await page.screenshot({ path: `${OUT}/${name}.png` })
  console.log('  ▸', name)
}

// 首次进入（devBypass 自动登录）
await page.goto(BASE + '/#/dashboard')
await page.waitForTimeout(2600)

console.log('[BOM 空态]')
await page.goto(BASE + '/#/bom')
await page.waitForTimeout(1200)
await shot('bom-01-empty')

console.log('[BOM 结果]')
await page.getByRole('button', { name: '载入示例' }).click()
await page.waitForTimeout(400)
await page.getByRole('button', { name: '解析并匹配库存' }).click()
await page.waitForTimeout(2200)
await shot('bom-02-result')

console.log('[BOM 出库确认]')
const consumeBtn = page.getByRole('button', { name: '一键出库' })
if (await consumeBtn.count()) {
  await consumeBtn.click()
  await page.waitForTimeout(600)
  await shot('bom-03-consume')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
}

console.log('[命令面板]')
await page.keyboard.press('Control+K')
await page.waitForTimeout(400)
await page.keyboard.type('10k', { delay: 90 })
await page.waitForTimeout(1000)
await shot('cmdk-01')
await page.keyboard.press('Escape')

console.log('[元器件低库存筛选]')
await page.goto(BASE + '/#/parts?filter=low')
await page.waitForTimeout(1600)
await shot('parts-01-low')

console.log('[标签打印]')
const ids = await page.evaluate(async () => {
  const r = await fetch('/api/parts?pageSize=5')
  const j = await r.json()
  return j.data.list.map((p) => p.id)
})
await page.goto(`${BASE}/#/labels?ids=${ids.join(',')}`)
await page.waitForTimeout(2200)
await shot('labels-01')

console.log('\n控制台错误:', errors.length ? errors.join('\n') : '无')
await browser.close()
