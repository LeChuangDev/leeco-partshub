// tests/integration/api-contract.mjs
// 接口契约测试：在进程内直接调用边缘函数入口（同一份 router），
// 覆盖鉴权、CRUD、出入库、移动、项目齐套、搜索、统计与备份恢复。
// 运行：npm run test:api

import { MemoryKV } from '../../server/infrastructure/kv/index.js'
import { handleApi } from '../../server/http/router.js'

let passed = 0
let failed = 0

function ok(name, condition, detail = '') {
  if (condition) {
    passed++
    console.log(`  ✓ ${name}`)
  } else {
    failed++
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

function makeClient(env) {
  return async function call(method, path, body) {
    const url = new URL(`http://localhost${path}`)
    const headers = {}
    if (body !== undefined) headers['content-type'] = 'application/json'
    const request = new Request(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined
    })
    const response = await handleApi(request, env, url)
    const payload = await response.json()
    return { status: response.status, ...payload }
  }
}

console.log('\n== API 契约测试 ==')

const env = { LOCAL_KV: new MemoryKV(), AUTH_DISABLED: '1' }
const call = makeClient(env)

// --- 鉴权 ---
const authDisabled = await call('GET', '/api/auth/check')
ok('免密环境 auth/check 返回已认证', authDisabled.code === 0 && authDisabled.data.authenticated === true)

const secureEnv = { LOCAL_KV: new MemoryKV(), AUTH_TOKEN: 'secret-token' }
const secureCall = makeClient(secureEnv)
const denied = await secureCall('GET', '/api/parts')
ok('缺少令牌返回 401', denied.status === 401 && denied.code === 401)

const url = new URL('http://localhost/api/parts')
const authorized = await handleApi(
  new Request(url, { headers: { 'X-Auth-Token': 'secret-token' } }), secureEnv, url
)
ok('携带正确令牌可访问', authorized.status === 200)

// --- 分类种子 ---
const categories = await call('GET', '/api/categories')
ok('首次访问写入默认分类', categories.code === 0 && categories.data.length > 0)
const rootCategory = categories.data[0]

// --- 位置 ---
const location = await call('POST', '/api/locations', { name: '契约测试柜', code: 'T-01' })
ok('创建位置', location.code === 0 && Boolean(location.data.id))
const locationId = location.data.id

// --- 元器件 ---
const part = await call('POST', '/api/parts', {
  name: '契约测试电阻',
  package: '0603',
  categoryId: rootCategory.id,
  manufacturerModel: 'RT0603-10K',
  params: { 阻值: '10kΩ' },
  safetyStock: 5
})
ok('创建元器件', part.code === 0 && Boolean(part.data.id))
ok('封装被归一化', part.data.package === '0603', part.data.package)
const partId = part.data.id

const missingName = await call('POST', '/api/parts', { package: '0603' })
ok('缺少名称被拒绝', missingName.code === 400)

// --- 入库 / 出库 ---
const stockIn = await call('POST', '/api/stock/in', { partId, quantity: 10, unitPrice: 0.02, supplier: '立创' })
ok('入库成功', stockIn.code === 0 && stockIn.data.stock.quantity === 10)

const afterIn = await call('GET', `/api/parts?id=${partId}`)
ok('库存合计为 10', afterIn.data.totalQuantity === 10, String(afterIn.data.totalQuantity))

const stockOut = await call('POST', '/api/stock/out', { partId, quantity: 4, reason: '领料' })
ok('出库成功并返回流水', stockOut.code === 0 && stockOut.data.transactions.length === 1)

const afterOut = await call('GET', `/api/parts?id=${partId}`)
ok('库存合计为 6', afterOut.data.totalQuantity === 6, String(afterOut.data.totalQuantity))

const overdraw = await call('POST', '/api/stock/out', { partId, quantity: 999 })
ok('超量出库被拒绝', overdraw.code === 400)

const badQty = await call('POST', '/api/stock/in', { partId, quantity: 0 })
ok('零入库被拒绝', badQty.code === 400)

// --- 移动位置 ---
const moved = await call('POST', '/api/stock/move', { partId, locationId })
ok('整颗料移动位置', moved.code === 0 && moved.data.moved === 1)

const movedAgain = await call('POST', '/api/stock/move', { partId, locationId })
ok('重复移动幂等', movedAgain.code === 0 && movedAgain.data.unchanged === true)

const badMove = await call('POST', '/api/stock/move', { partId, locationId: 'loc_not_exist' })
ok('目标位置不存在被拒绝', badMove.code === 400)

// --- 流水 ---
const txns = await call('GET', `/api/transactions?partId=${partId}`)
ok('流水按元器件可查', txns.code === 0 && txns.data.length === 2)

// --- 项目 BOM ---
const project = await call('POST', '/api/projects', {
  name: '契约测试项目',
  buildQty: 2,
  lines: [{ partId, quantity: 3 }]
})
ok('创建项目并写入 BOM 行', project.code === 0 && project.data.lines.length === 1)
const projectId = project.data.project.id

const analysis = await call('GET', `/api/projects/${projectId}?buildQty=2`)
ok('项目齐套分析返回汇总', analysis.code === 0 && Boolean(analysis.data.summary))
ok('需求 = 单套用量 × 投产套数', analysis.data.summary.requiredQty === 6, String(analysis.data.summary.requiredQty))

const saveBom = await call('PUT', `/api/projects/${projectId}/bom`, {
  lines: [{ partId, quantity: 1 }],
  buildQty: 1
})
ok('覆盖保存 BOM 行', saveBom.code === 0 && saveBom.data.lines.length === 1)

// --- 搜索 / 统计 ---
const search = await call('GET', '/api/search?q=契约测试电阻&limit=5')
ok('全局搜索命中器件', search.code === 0 && search.data.parts.length === 1)

const stats = await call('GET', '/api/stats?period=week')
ok('统计返回总量与货值', stats.code === 0 && stats.data.partsCount >= 1 && stats.data.totalQuantity === 6)

// --- 备份恢复 ---
const exported = await call('GET', '/api/export/all')
ok('全量导出包含器件与项目', exported.code === 0 && exported.data.parts.length === 1 && exported.data.projects.length === 1)

const restored = await call('POST', '/api/export/restore', exported.data)
ok('恢复成功并返回计数', restored.code === 0 && restored.data.counts.parts === 1)

const afterRestore = await call('GET', `/api/parts?id=${partId}`)
ok('恢复后库存与流水可用', afterRestore.data.totalQuantity === 6)

const invalidRestore = await call('POST', '/api/export/restore', { foo: 1 })
ok('无效备份被拒绝', invalidRestore.code === 400)

// --- 路由边界 ---
const unknown = await call('GET', '/api/not-a-route')
ok('未知路由返回 404', unknown.status === 404)

const wrongMethod = await call('PATCH', '/api/categories')
ok('不支持的方法返回 405', wrongMethod.status === 405)


// --- 统计口径：项目数由 HTTP 层补齐 ---
const stats2 = await call('GET', '/api/stats')
ok('stats.projectsCount 返回真实项目数', stats2.code === 0 && stats2.data.projectsCount >= 1,
  String(stats2.data.projectsCount))

// --- 恢复预演（不写库） ---
const dry = await call('POST', '/api/export/restore?dryRun=1', exported.data)
ok('dryRun 只返回预演计数', dry.code === 0 && dry.data.dryRun === true && dry.data.counts.parts === 1)
const partsAfterDry = await call('GET', '/api/parts')
ok('dryRun 未改动现有数据', partsAfterDry.data.total === 1, String(partsAfterDry.data.total))

// --- 扫码合并入库 ---
const mergePart = await call('POST', '/api/parts', { name: '合并测试电阻', package: '0603' })
const mergeId = mergePart.data.id
await call('POST', '/api/stock/in', { partId: mergeId, quantity: 1, unitPrice: 0.01, locationId, merge: true, source: 'scan' })
const mergedIn = await call('POST', '/api/stock/in', { partId: mergeId, quantity: 2, unitPrice: 0.01, locationId, merge: true, source: 'scan' })
const mergeBatches = await call('GET', `/api/stock?partId=${mergeId}`)
ok('扫码合并只保留一个批次', mergedIn.data.merged === true && mergeBatches.data.length === 1)
ok('合并后数量累加为 3', mergeBatches.data[0].quantity === 3)

// --- 审计日志 ---
const auditAll = await call('GET', '/api/audit?limit=500')
ok('审计日志可通过接口读取', auditAll.code === 0 && Array.isArray(auditAll.data) && auditAll.data.length > 0)
ok('审计日志覆盖五类操作',
  ['stock.in', 'stock.out', 'stock.move', 'import.commit', 'backup.restore']
    .every((a) => auditAll.data.some((e) => e.action === a)) ||
  // 本契约测试尚未提交导入时，至少覆盖库存三类与恢复
  ['stock.in', 'stock.out', 'stock.move', 'backup.restore'].every((a) => auditAll.data.some((e) => e.action === a)),
  [...new Set(auditAll.data.map((e) => e.action))].join(','))
const auditIn = await call('GET', '/api/audit?action=stock.in')
ok('审计日志按动作过滤', auditIn.data.length > 0 && auditIn.data.every((e) => e.action === 'stock.in'))

// --- 导入批次与撤销 ---
const beforeImport = (await call('GET', '/api/parts')).data.total
const imported = await call('POST', '/api/import/batch', {
  items: [
    { index: 0, action: 'create', partData: { name: '契约导入电容', package: '0603' }, row: { quantity: 5, unitPrice: 0.2 } }
  ]
})
ok('导入返回 batchId', imported.code === 0 && Boolean(imported.data.batchId), JSON.stringify(imported.data))
const batchList = await call('GET', '/api/import/batches')
ok('批次列表标记可撤销', batchList.data.some((b) => b.id === imported.data.batchId && b.undoable))
const undo = await call('POST', '/api/import/undo', { batchId: imported.data.batchId })
ok('撤销导入成功', undo.code === 0 && undo.data.removed.parts === 1)
ok('撤销后器件数恢复', (await call('GET', '/api/parts')).data.total === beforeImport)
const undoAgain = await call('POST', '/api/import/undo', { batchId: imported.data.batchId })
ok('重复撤销被拒绝', undoAgain.status === 400)
const auditAfterUndo = await call('GET', '/api/audit?limit=500')
ok('导入与撤销均写入审计',
  auditAfterUndo.data.some((e) => e.action === 'import.commit') &&
  auditAfterUndo.data.some((e) => e.action === 'import.undo'))

console.log(`\n========== API 契约: ${passed} 通过, ${failed} 失败 ==========`)
process.exit(failed === 0 ? 0 : 1)
