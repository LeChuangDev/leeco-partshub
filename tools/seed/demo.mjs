// 演示数据：npm run seed / npm run seed:clean
// 仅用于本地截图核对，用完即清，不进备份。
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'

const BASE = 'http://127.0.0.1:8787/api'
const H = { 'content-type': 'application/json', 'x-auth-token': 'dev-leeco-token' }
mkdirSync('.data', { recursive: true })
const IDS = '.data/demo-ids.json'

async function call(path, method = 'GET', body) {
  const r = await fetch(BASE + path, { method, headers: H, body: body ? JSON.stringify(body) : undefined })
  const j = await r.json()
  if (j.code !== 0) throw new Error(`${method} ${path} -> ${j.msg}`)
  return j.data
}

const mode = process.argv[2] || 'seed'

if (mode === 'clean') {
  if (!existsSync(IDS)) { console.log('没有演示数据记录'); process.exit(0) }
  const ids = JSON.parse(readFileSync(IDS, 'utf-8'))
  for (const id of ids.parts) { try { await call(`/parts?id=${id}`, 'DELETE') } catch {} }
  for (const id of ids.locations) { try { await call(`/locations?id=${id}`, 'DELETE') } catch {} }
  console.log(`已清理演示数据：${ids.parts.length} 个器件 / ${ids.locations.length} 个位置`)
  process.exit(0)
}

const cats = await call('/categories')
const find = (name) => cats.find((c) => c.name === name)?.id || null

const root = await call('/locations', 'POST', { name: '元件柜', code: 'CAB-1' })
const a1 = await call('/locations', 'POST', { name: 'A1 抽屉', parentId: root.id, code: 'A1' })
const a2 = await call('/locations', 'POST', { name: 'A2 抽屉', parentId: root.id, code: 'A2' })

const parts = [
  { name: '0603 10kΩ 电阻', categoryId: find('电阻'), package: '0603', manufacturerModel: 'RC0603FR-0710KL', brand: 'Yageo', safetyStock: 100, params: { resistance: '10kΩ', tolerance: '±1%' }, qty: 200, price: 0.008, loc: a1.id },
  { name: '0603 100nF 电容', categoryId: find('电容'), package: '0603', manufacturerModel: 'GRM188R71H104KA93D', brand: 'Murata', safetyStock: 100, params: { capacitance: '100nF', voltage: '50V' }, qty: 30, price: 0.012, loc: a1.id },
  { name: 'STM32F103C8T6', categoryId: find('MCU/单片机'), package: 'LQFP-48', manufacturerModel: 'STM32F103C8T6', brand: 'ST', safetyStock: 2, params: { flash: '64KB' }, qty: 5, price: 8.6, loc: a2.id },
  { name: 'SS34 肖特基二极管', categoryId: find('整流/肖特基'), package: 'SMA', manufacturerModel: 'SS34', brand: 'MDD', safetyStock: 20, qty: 0, price: 0.05, loc: null },
  { name: 'AMS1117-3.3 LDO', categoryId: find('LDO 线性稳压'), package: 'SOT-223', manufacturerModel: 'AMS1117-3.3', brand: 'AMS', safetyStock: 10, qty: 60, price: 0.35, loc: a2.id }
]

const created = { parts: [], locations: [root.id, a1.id, a2.id] }
for (const p of parts) {
  const { qty, price, loc, ...data } = p
  const part = await call('/parts', 'POST', data)
  created.parts.push(part.id)
  if (qty > 0) {
    await call('/stock/in', 'POST', {
      partId: part.id, quantity: qty, unitPrice: price, supplier: '立创',
      orderNo: 'DEMO-001', locationId: loc
    })
  }
}

writeFileSync(IDS, JSON.stringify(created, null, 2))
console.log(`已创建演示数据：${created.parts.length} 个器件 / ${created.locations.length} 个位置`)
