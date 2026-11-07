import { chromium } from 'playwright'
const BASE = 'http://127.0.0.1:5173'
const b = await chromium.launch({ channel: 'chrome', headless: true })
const p = await (await b.newContext({ viewport: { width: 1440, height: 940 } })).newPage()
const errs = []
p.on('pageerror', e => errs.push(e.message))
p.on('console', m => { if (m.type() === 'error') errs.push(m.text()) })
const log = (...a) => console.log(...a)
await p.goto(BASE + '/#/projects'); await p.waitForTimeout(2500)

// 1) 行数基线
const rowCount = () => p.locator('.n-data-table-tbody .n-data-table-tr').count()
log('初始行数', await rowCount())

// 2) 添加物料行
await p.getByRole('button', { name: '添加行' }).click(); await p.waitForTimeout(600)
await p.locator('.n-modal .n-select').first().click(); await p.waitForTimeout(900)
await p.locator('.n-base-select-option', { hasText: 'SS34' }).first().click(); await p.waitForTimeout(300)
const inputs = p.locator('.n-modal .n-input input')
await inputs.nth(0).fill('D9')
await p.getByRole('button', { name: '确定' }).click(); await p.waitForTimeout(1600)
log('添加后行数', await rowCount(), '| 有 D9:', (await p.locator('.n-data-table-tbody').innerText()).includes('D9'))

// 3) 移除刚加的行
const row = p.locator('.n-data-table-tbody .n-data-table-tr', { hasText: 'D9' })
await row.locator('.mini-btn.danger').click(); await p.waitForTimeout(500)
await p.locator('.n-dialog__action button', { hasText: '移除' }).click(); await p.waitForTimeout(1500)
log('移除后行数', await rowCount(), '| D9 还在:', (await p.locator('.n-data-table-tbody').innerText()).includes('D9'))

// 4) 导入弹窗
await p.getByRole('button', { name: '导入 BOM' }).click(); await p.waitForTimeout(500)
await p.getByRole('button', { name: '载入示例' }).click(); await p.waitForTimeout(300)
log('示例文本长度', (await p.locator('.n-modal textarea').inputValue()).length)
await p.getByRole('button', { name: '取消' }).click(); await p.waitForTimeout(400)

// 5) 领料弹窗（取消，不动库存）
await p.getByRole('button', { name: '一键领料' }).click(); await p.waitForTimeout(500)
const dlg = await p.locator('.n-dialog').innerText()
log('领料弹窗包含齐套提示:', dlg.includes('齐套') || dlg.includes('出库'))
await p.locator('.n-dialog__action button', { hasText: '取消' }).click(); await p.waitForTimeout(400)

// 6) 新建项目 -> 删除
await p.getByRole('button', { name: '新建项目' }).click(); await p.waitForTimeout(500)
await p.locator('.n-modal input').first().fill('临时测试项目')
const btns = p.locator('.n-modal button', { hasText: '创建' })
await btns.last().click(); await p.waitForTimeout(1800)
log('新建后 chip:', (await p.locator('.prj-chips').innerText()).includes('临时测试项目'))
await p.locator('.head-actions button.type-error, .head-actions .n-button--error-type').last().click().catch(async () => {
  await p.locator('.head-actions .n-button').last().click()
})
await p.waitForTimeout(600)
await p.locator('.n-dialog__action button', { hasText: '删除' }).click(); await p.waitForTimeout(1600)
log('删除后 chip:', (await p.locator('.prj-chips').innerText()).includes('临时测试项目'))
log('错误:', errs.length ? errs.join(' | ') : 'none')
await b.close()
