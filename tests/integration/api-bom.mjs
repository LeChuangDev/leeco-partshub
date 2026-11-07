// tests/integration/api-bom.mjs
// BOM 接口冒烟：需先启动 npm run dev:api（默认 8787）。

const BASE = 'http://127.0.0.1:8787/api'
const H = { 'content-type': 'application/json', 'x-auth-token': 'dev-leeco-token' }

async function call(path, method = 'GET', body) {
  const r = await fetch(BASE + path, { method, headers: H, body: body ? JSON.stringify(body) : undefined })
  const j = await r.json()
  if (j.code !== 0) throw new Error(`${method} ${path} -> ${j.msg}`)
  return j.data
}

const created = []
function check(name, cond, extra = '') {
  console.log(`${cond ? '  ✓' : '  ✗'} ${name} ${cond ? '' : extra}`)
  if (!cond) process.exitCode = 1
}

try {
  const cats = await call('/categories')
  const resCat = cats.find((c) => c.name === '电阻')

  const pR = await call('/parts', 'POST', {
    name: '0603 10kΩ 电阻', categoryId: resCat.id, package: '0603',
    manufacturerModel: 'RC0603FR-0710KL', safetyStock: 20, params: { resistance: '10kΩ' }
  })
  created.push(pR.id)
  await call('/stock/in', 'POST', { partId: pR.id, quantity: 5, unitPrice: 0.01, supplier: '立创' })

  const pU = await call('/parts', 'POST', {
    name: 'STM32F103C8T6', package: 'LQFP-48', manufacturerModel: 'STM32F103C8T6'
  })
  created.push(pU.id)
  await call('/stock/in', 'POST', { partId: pU.id, quantity: 3, unitPrice: 6.5 })

  console.log('\n[BOM 接口]')
  const rows = [
    { designators: 'R1,R2', model: 'RC0603FR-0710KL', package: '0603', required: 2 },
    { designators: 'U1', model: 'STM32F103C8T6', package: 'LQFP-48', required: 1 },
    { designators: 'C1', model: 'GRM188R71H104KA93D', name: '100nF 电容', package: '0603', required: 10 }
  ]
  const match = await call('/bom/match', 'POST', { rows })
  check('返回 3 行', match.lines.length === 3, JSON.stringify(match.summary))
  check('电阻匹配成功', match.lines[0].partId === pR.id)
  check('电阻齐套', match.lines[0].status === 'ok')
  check('电容未建档', match.lines[2].status === 'missing')
  check('齐套率按数量计算为 23%', match.summary.completeness === 23, String(match.summary.completeness))

  const consume = await call('/bom/consume', 'POST', {
    projectName: 'E2E 测试板', lines: match.lines.filter((l) => l.status === 'ok')
  })
  check('出库成功', consume.ok === true && consume.totalOut === 3, JSON.stringify(consume))
  const after = await call(`/parts?id=${pR.id}`)
  check('电阻库存扣减到 3', after.totalQuantity === 3, String(after.totalQuantity))
  const txns = await call(`/transactions?partId=${pR.id}`)
  check('流水写入 BOM 原因', txns.some((t) => t.reason.includes('E2E 测试板')), JSON.stringify(txns[0]))

  console.log('\n[全局搜索接口]')
  const s1 = await call('/search?q=' + encodeURIComponent('RC0603'))
  check('按型号搜到电阻', s1.parts.some((p) => p.id === pR.id), JSON.stringify(s1.parts.map((p) => p.name)))
  const s2 = await call('/search?q=' + encodeURIComponent('10k 0603'))
  check('按参数+封装搜到电阻', s2.parts.some((p) => p.id === pR.id))
  const s3 = await call('/search?q=xzqv')
  check('无结果返回空数组', s3.parts.length === 0)

  console.log('\n[异常分支]')
  let err = ''
  try { await call('/bom/match', 'POST', {}) } catch (e) { err = e.message }
  check('rows 缺失返回 400', err.includes('rows'), err)
  let err2 = ''
  try { await call('/bom/consume', 'POST', { lines: [] }) } catch (e) { err2 = e.message }
  check('空 lines 返回 400', err2.includes('lines'), err2)
} finally {
  for (const id of created) {
    try { await call(`/parts?id=${id}`, 'DELETE') } catch {}
  }
  console.log('\n清理完成')
}
