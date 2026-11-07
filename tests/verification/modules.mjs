// tests/verification/modules.mjs
// 逐模块功能验证：自启动一个隔离的本地 API 实例（独立端口 + 独立 KV 文件），
// 跑完自动关闭并删除临时数据，完全不触碰 dev 演示库。
// 运行：npm run verify:modules

import { spawn } from 'node:child_process'
import { existsSync, unlinkSync, mkdirSync } from 'node:fs'
import { buildPartQrText, buildLocationQrText, isPublicOrigin } from '../../server/domain/qr.js'
import { parseScanPayload } from '../../server/domain/scan.js'
import { BRAND_TITLE, LEGACY_BRAND_TITLES } from '../../server/domain/brand.js'

const PORT = 8788
const BASE = `http://127.0.0.1:${PORT}/api`
const KV_FILE = '.data/verify-kv.json'

let current = ''
const groups = new Map()
let passed = 0
let failed = 0

function section(name) {
  current = name
  if (!groups.has(name)) groups.set(name, { pass: 0, fail: 0 })
  console.log(`\n== ${name} ==`)
}
function ok(name, cond, detail = '') {
  const g = groups.get(current)
  if (cond) {
    passed++
    g.pass++
    console.log(`  ✓ ${name}`)
  } else {
    failed++
    g.fail++
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

async function call(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined
  })
  const j = await res.json().catch(() => ({ code: -1, data: {}, msg: '响应解析失败' }))
  return { status: res.status, code: j.code, data: j.data, msg: j.msg }
}
const get = (p) => call('GET', p)
const post = (p, b) => call('POST', p, b)
const put = (p, b) => call('PUT', p, b)
const del = (p) => call('DELETE', p)

async function main() {
  mkdirSync('.data', { recursive: true })
  if (existsSync(KV_FILE)) unlinkSync(KV_FILE)

  // 确认隔离端口空闲，避免误连到别的服务
  try {
    const probe = await fetch(`http://127.0.0.1:${PORT}/api/auth/check`)
    if (probe.ok) throw new Error(`端口 ${PORT} 已被占用`)
  } catch (e) {
    if (String(e.message).includes('已被占用')) throw e
  }

  const child = spawn(process.execPath, ['tools/dev-server/index.mjs'], {
    env: { ...process.env, PORT: String(PORT), KV_FILE, AUTH_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe']
  })
  let childLog = ''
  child.stdout.on('data', (d) => { childLog += d })
  child.stderr.on('data', (d) => { childLog += d })

  try {
    let ready = false
    for (let i = 0; i < 40; i++) {
      try {
        const r = await fetch(`${BASE}/auth/check`)
        if (r.ok) { ready = true; break }
      } catch { /* 尚未监听 */ }
      await new Promise((r) => setTimeout(r, 150))
    }
    if (!ready) throw new Error(`隔离服务未启动：\n${childLog}`)
    await runAll()
  } finally {
    child.kill()
    await new Promise((r) => setTimeout(r, 250))
    try { if (existsSync(KV_FILE)) unlinkSync(KV_FILE) } catch { /* 忽略占用 */ }
  }

  console.log('\n========== 模块汇总 ==========')
  for (const [name, g] of groups) {
    console.log(`  ${g.fail ? '✗' : '✓'} ${name}: ${g.pass} 通过 / ${g.fail} 失败`)
  }
  console.log(`\n========== 模块验证: ${groups.size} 个模块, ${passed} 通过, ${failed} 失败 ==========`)
  process.exit(failed === 0 ? 0 : 1)
}

async function runAll() {
  /* ---------------- M1 主数据与分类 ---------------- */
  section('M1 主数据与分类')
  const cats = await get('/categories')
  ok('默认分类模板写入', cats.code === 0 && cats.data.length >= 9, `实际 ${cats.data?.length}`)
  const cat = await post('/categories', {
    name: '验证分类', parentId: null,
    paramTemplate: [{ key: 'resistance', label: '阻值', type: 'text', unit: 'Ω' }]
  })
  ok('创建分类（含中文参数模板）', cat.code === 0 && Boolean(cat.data?.id))
  const catId = cat.data?.id
  const catOne = await get(`/categories?id=${catId}`)
  ok('分类单条查询', catOne.code === 0 && catOne.data?.paramTemplate?.length === 1)
  const catUpd = await put('/categories', { id: catId, name: '验证分类-改' })
  ok('分类更新保留参数模板', catUpd.code === 0 && catUpd.data?.paramTemplate?.length === 1)

  const part = await post('/parts', {
    name: '验证电阻 10kΩ 0603', package: '0603', categoryId: catId,
    manufacturerModel: 'RC0603-10K', params: { 阻值: '10000 Ω' },
    tags: ['验证'], safetyStock: 5, brand: 'YAGEO'
  })
  ok('创建元器件', part.code === 0 && Boolean(part.data?.id))
  const partId = part.data?.id
  ok('封装自动归一化', part.data?.package === '0603', String(part.data?.package))
  ok('电气参数归一化并保留', Object.keys(part.data?.params || {}).length > 0, JSON.stringify(part.data?.params))
  const detail = await get(`/parts?id=${partId}`)
  ok('详情返回批次与库存合计', detail.code === 0 && Array.isArray(detail.data?.stocks) && detail.data.totalQuantity === 0)
  const byModel = await get('/parts?search=RC0603-10K')
  ok('按型号检索命中', byModel.code === 0 && byModel.data?.total >= 1, JSON.stringify(byModel.data?.total))
  const byExpr = await get('/parts?expr=10k')
  ok('工程表达式检索接口可用', byExpr.code === 0 && Array.isArray(byExpr.data?.list))
  const byCat = await get(`/parts?categoryId=${catId}`)
  ok('按分类筛选命中', byCat.code === 0 && byCat.data?.list?.some((p) => p.id === partId))
  const byTag = await get('/parts?tag=验证')
  ok('按标签筛选命中', byTag.code === 0 && byTag.data?.list?.some((p) => p.id === partId))
  const paged = await get('/parts?page=1&pageSize=1')
  ok('分页参数生效', paged.code === 0 && paged.data?.list?.length <= 1 && paged.data.pageSize === 1)
  const updPart = await put('/parts', { id: partId, brand: '国巨' })
  ok('元器件更新', updPart.code === 0 && updPart.data?.brand === '国巨')
  const badPart = await post('/parts', { package: '0603' })
  ok('缺少名称被拒绝', badPart.code === 400)

  /* ---------------- M2 库存批次与位置 ---------------- */
  section('M2 库存批次与位置')
  const locA = await post('/locations', { name: '验证柜', code: 'V-A' })
  const locB = await post('/locations', { name: '验证抽屉', code: 'V-B', parentId: locA.data?.id })
  ok('创建父子位置', locA.code === 0 && locB.code === 0 && locB.data?.parentId === locA.data?.id)
  const locList = await get('/locations')
  ok('位置列表含层级', locList.code === 0 && locList.data?.length >= 2)
  const locUpd = await put('/locations', { id: locB.data?.id, code: 'V-B2' })
  ok('位置更新', locUpd.code === 0 && locUpd.data?.code === 'V-B2')

  const in1 = await post('/stock/in', { partId, quantity: 10, unitPrice: 0.1, locationId: locA.data?.id })
  const in2 = await post('/stock/in', { partId, quantity: 5, unitPrice: 0.2, locationId: locB.data?.id })
  ok('两次入库创建两个批次', in1.code === 0 && in2.code === 0)
  let batches = (await get(`/stock?partId=${partId}`)).data
  ok('批次按器件可查', batches?.length === 2, `实际 ${batches?.length}`)
  ok('库存合计 15', batches.reduce((s, b) => s + b.quantity, 0) === 15)
  const merged = await post('/stock/in', { partId, quantity: 3, unitPrice: 0.1, locationId: locA.data?.id, merge: true, source: 'scan' })
  ok('扫码合并到同位置同单价批次', merged.code === 0 && merged.data?.merged === true)
  batches = (await get(`/stock?partId=${partId}`)).data
  ok('合并后批次仍为 2', batches.length === 2, `实际 ${batches.length}`)
  ok('合并后库存合计 18', batches.reduce((s, b) => s + b.quantity, 0) === 18)

  const target = batches.find((b) => Number(b.unitPrice) === 0.2)
  const outOne = await post('/stock/out', { partId, quantity: 2, stockId: target.id })
  ok('指定批次出库', outOne.code === 0 && outOne.data?.transactions?.length === 1)
  batches = (await get(`/stock?partId=${partId}`)).data
  ok('目标批次 5→3', batches.find((b) => b.id === target.id).quantity === 3)
  const outFifo = await post('/stock/out', { partId, quantity: 12 })
  ok('跨批次 FIFO 出库', outFifo.code === 0 && outFifo.data?.transactions?.length >= 1)
  ok('FIFO 后库存合计 4', (await get(`/parts?id=${partId}`)).data?.totalQuantity === 4)
  ok('超量出库被拒绝', (await post('/stock/out', { partId, quantity: 999 })).code === 400)
  ok('零数量入库被拒绝', (await post('/stock/in', { partId, quantity: 0 })).code === 400)

  const moved = await post('/stock/move', { partId, locationId: locB.data?.id })
  ok('整颗料移动位置', moved.code === 0 && moved.data?.moved >= 1)
  ok('批次位置已更新', (await get(`/stock?partId=${partId}`)).data.every((b) => b.locationId === locB.data?.id))
  ok('移动不改变库存数量', (await get(`/parts?id=${partId}`)).data?.totalQuantity === 4)
  ok('目标位置不存在被拒绝', (await post('/stock/move', { partId, locationId: 'not-exist' })).code === 400)
  const txns = await get(`/transactions?partId=${partId}`)
  ok('流水可查且带审计字段', txns.code === 0 && txns.data?.length >= 5 &&
    txns.data.every((t) => 'source' in t && 'beforeQty' in t && 'afterQty' in t), `条数 ${txns.data?.length}`)

  await del(`/locations?id=${locA.data?.id}`)
  const locBAfter = await get(`/locations?id=${locB.data?.id}`)
  ok('删除父位置后子位置上移', locBAfter.code === 0 && !locBAfter.data?.parentId)
  const delPart = await del(`/parts?id=${partId}`)
  ok('删除元器件级联清理批次', delPart.code === 0 && (await get(`/stock?partId=${partId}`)).data?.length === 0)
  ok('删除后详情返回 404', (await get(`/parts?id=${partId}`)).status === 404)
  ok('移走器件后分类可删除', (await del(`/categories?id=${catId}`)).code === 0)

  /* ---------------- M3 订单导入 ---------------- */
  section('M3 多渠道订单导入')
  const rows = [
    { name: '贴片电阻 10kΩ 0603', manufacturerModel: 'IMP-R-10K', package: '0603', quantity: 10, platform: 'lcsc', sku: 'C99999', unitPrice: 0.05 },
    { name: '贴片电容 100nF 0603', manufacturerModel: 'IMP-C-104', package: '0603', quantity: 20, platform: 'lcsc', sku: 'C88888', unitPrice: 0.08 }
  ]
  const plan = await post('/import/batch', { rows })
  ok('生成导入计划', plan.code === 0 && plan.data?.items?.length === 2, JSON.stringify(plan.data?.summary))
  ok('计划含新建动作', plan.data?.items?.some((i) => i.action === 'create'))
  const beforeImport = (await get('/parts')).data.total
  const committed = await post('/import/batch', { items: plan.data.items })
  ok('提交导入并返回批次号', committed.code === 0 && Boolean(committed.data?.batchId), JSON.stringify(committed.data?.summary))
  ok('导入后器件数 +2', (await get('/parts')).data.total === beforeImport + 2)
  const batchList = await get('/import/batches')
  ok('批次列表标记可撤销', batchList.code === 0 && batchList.data?.some((b) => b.id === committed.data.batchId && b.undoable))
  const undone = await post('/import/undo', { batchId: committed.data.batchId })
  ok('一键撤销导入', undone.code === 0 && undone.data?.removed?.parts === 2)
  ok('撤销后器件数恢复', (await get('/parts')).data.total === beforeImport)
  ok('重复撤销被拒绝', (await post('/import/undo', { batchId: committed.data.batchId })).status === 400)
  const badImport = await post('/import/batch', { items: [{ index: 0, action: 'create', partData: { name: '无效行' }, row: { quantity: 0 } }] })
  ok('无效数量返回失败明细', badImport.code === 0 && badImport.data?.errors?.length >= 1)
  if (badImport.data?.batchId) await post('/import/undo', { batchId: badImport.data.batchId })

  /* ---------------- M4 BOM 齐套 ---------------- */
  section('M4 BOM 齐套分析')
  const parse = await post('/bom/parse', { text: 'R1,R2,IMP-R-10K,齐套电阻,0603,2\nC1,IMP-C-104,贴片电容,0603,1' })
  ok('粘贴文本解析为行', parse.code === 0 && Array.isArray(parse.data?.rows) && parse.data.rows.length >= 1)
  const template = await get('/bom/template')
  ok('导入模板可获取', template.code === 0 && Array.isArray(template.data?.columns))
  const bomPart = await post('/parts', { name: '齐套电阻', manufacturerModel: 'BOM-R-10K', package: '0603' })
  await post('/stock/in', { partId: bomPart.data.id, quantity: 10 })
  const match = await post('/bom/match', {
    rows: [
      { model: 'BOM-R-10K', name: '齐套电阻', package: '0603', quantity: 5 },
      { model: 'BOM-R-10K', name: '齐套电阻', package: '0603', quantity: 20 },
      { model: 'UNKNOWN-XYZ', name: '未建档料', package: '0603', quantity: 3 }
    ]
  })
  ok('齐套匹配返回行与汇总', match.code === 0 && match.data?.lines?.length === 3)
  const s = match.data?.summary || {}
  ok('齐套率按件数计算（含部分 credit）', s.requiredQty > 0 && s.completeness === Math.round(s.readyQty / s.requiredQty * 100), JSON.stringify(s))
  ok('匹配率按行计算', s.lineCount > 0 && s.coverage === Math.round(s.matchedLines / s.lineCount * 100))
  ok('缺料行不含未建档', s.shortageLines === s.shortLines + s.emptyLines)
  ok('缺料行含未建档口径', s.shortageLinesIncludingUnlinked === s.shortageLines + s.missingLines)
  ok('状态含齐套 / 缺料 / 未建档', ['ok', 'short', 'missing'].every((st) => match.data.lines.some((l) => l.status === st)),
    match.data.lines.map((l) => l.status).join(','))
  const okLine = match.data.lines.find((l) => l.status === 'ok')
  const consumed = await post('/bom/consume', {
    lines: [{ lineNo: okLine.lineNo, partId: okLine.partId, required: okLine.required, designators: okLine.designators }],
    projectName: '验证项目'
  })
  ok('一键出库按提交行扣减', consumed.code === 0 && consumed.data?.totalOut === okLine.required, JSON.stringify(consumed.data))
  ok('出库后库存 10→5', (await get(`/parts?id=${bomPart.data.id}`)).data?.totalQuantity === 5)
  const overConsume = await post('/bom/consume', {
    lines: [{ lineNo: 9, partId: bomPart.data.id, required: 999, designators: 'X1' }], projectName: '验证项目'
  })
  ok('超量出库返回失败行', overConsume.code === 0 && overConsume.data?.failed?.length >= 1)

  /* ---------------- M5 项目 BOM ---------------- */
  section('M5 项目 BOM')
  const prj = await post('/projects', { name: '验证项目', buildQty: 2, lines: [{ partId: bomPart.data.id, quantity: 3 }] })
  ok('创建项目并写入 BOM 行', prj.code === 0 && prj.data?.lines?.length === 1)
  const prjId = prj.data?.project?.id
  const prjList = await get('/projects')
  ok('项目列表可查', prjList.code === 0 && prjList.data?.some((p) => p.id === prjId))
  const analysis = await get(`/projects/${prjId}?buildQty=2`)
  ok('需求 = 单套用量 × 投产套数', analysis.code === 0 && analysis.data?.summary?.requiredQty === 6,
    String(analysis.data?.summary?.requiredQty))
  const saved = await put(`/projects/${prjId}/bom`, { lines: [{ partId: bomPart.data.id, quantity: 2 }], buildQty: 1 })
  ok('覆盖保存 BOM 行', saved.code === 0 && saved.data?.lines?.length === 1)
  const importedBom = await post(`/projects/${prjId}/import`, { text: 'R1,BOM-R-10K,齐套电阻,0603,2', mode: 'replace' })
  ok('项目 BOM 文本导入', importedBom.code === 0 && typeof importedBom.data?.imported === 'number')
  const reanalyze = await get(`/projects/${prjId}/analyze`)
  ok('重新分析返回汇总', reanalyze.code === 0 && Boolean(reanalyze.data?.summary))
  const take = await post(`/projects/${prjId}/consume`, {})
  ok('按项目领料写流水', take.code === 0 && (take.data?.ok || take.data?.partial), JSON.stringify(take.data?.failed))
  const prjUpd = await put(`/projects/${prjId}`, { name: '验证项目-改' })
  ok('项目元信息更新', prjUpd.code === 0 && prjUpd.data?.project?.name === '验证项目-改')
  ok('删除项目', (await del(`/projects/${prjId}`)).code === 0)
  ok('删除后列表不含该项目', !(await get('/projects')).data?.some((p) => p.id === prjId))

  /* ---------------- M6 标签与二维码 ---------------- */
  section('M6 标签与二维码')
  const qrPart = { id: 'p_qr', name: '二维码测试电阻', manufacturerModel: 'QR-R-10K', package: '0603', params: { 阻值: '10kΩ' } }
  const qrCompact = buildPartQrText(qrPart, { quantity: 96, locationPath: 'A柜 / 01层 / 电阻盒', mode: 'compact' })
  ok('简版码不超过 8 行', qrCompact.split('\n').length <= 8, `实际 ${qrCompact.split('\n').length}`)
  ok('简版码含品牌名 / 型号 / 封装 / 库存 / 库位',
    qrCompact.includes(BRAND_TITLE) && qrCompact.includes('QR-R-10K') && qrCompact.includes('0603') &&
    qrCompact.includes('库存 96') && qrCompact.includes('01层/电阻盒'))
  const qrFull = buildPartQrText(qrPart, { quantity: 96, locationPath: 'A柜 / 电阻盒', mode: 'full', origin: 'https://parts.example.com' })
  ok('完整码仅公网追加详情链接', qrFull.includes('https://parts.example.com/#/p/p_qr') &&
    !buildPartQrText(qrPart, { quantity: 1, mode: 'full', origin: 'http://127.0.0.1:5173' }).includes('http://127.0.0.1'))
  ok('公网判定正确', isPublicOrigin('https://parts.example.com') && !isPublicOrigin('http://localhost:5173'))
  const locQr = buildLocationQrText({ id: 'loc_qr', name: '电阻盒', code: 'A-01' }, { path: 'A柜 / 01层 / 电阻盒', partKinds: 12, quantity: 340 })
  ok('库位码含路径与统计', locQr.includes('A柜 / 01层 / 电阻盒') && locQr.includes('12 种 / 340 件'))
  const scPart = parseScanPayload(qrCompact)
  ok('扫码解析器件码', scPart.kind === 'part' && scPart.model === 'QR-R-10K', JSON.stringify(scPart))
  const scLoc = parseScanPayload(locQr)
  ok('扫码解析库位码', scLoc.kind === 'location' && scLoc.code === 'A-01')
  ok('扫码解析详情链接', parseScanPayload('https://parts.example.com/#/p/abc').kind === 'part')
  ok('扫码解析 JSON', parseScanPayload(JSON.stringify({ partId: 'abc' })).kind === 'part')
  ok('纯条码降级为检索词', parseScanPayload('C2044471').kind === 'query')
  ok('旧品牌名标签仍可识别', parseScanPayload(qrCompact.replace(BRAND_TITLE, LEGACY_BRAND_TITLES[0])).kind === 'part')

  /* ---------------- M7 看板与备份 ---------------- */
  section('M7 看板与备份')
  const week = await get('/stats?period=week')
  ok('看板统计字段齐全', week.code === 0 && ['partsCount', 'totalQuantity', 'totalValue', 'lowStockCount', 'shortageCount', 'trend', 'byCategory'].every((k) => k in week.data))
  ok('周趋势 7 天', week.data?.trend?.labels?.length === 7)
  const month = await get('/stats?period=month')
  ok('月趋势 30 天', month.data?.trend?.labels?.length === 30)
  const year = await get('/stats?period=year')
  ok('年趋势 12 月', year.data?.trend?.labels?.length === 12)
  ok('项目数由索引真实提供', typeof week.data?.projectsCount === 'number')
  const search = await get('/search?q=齐套电阻')
  ok('全局搜索命中器件', search.code === 0 && search.data?.parts?.length >= 1)
  const backup = await get('/export/all')
  ok('全量导出结构完整', backup.code === 0 && ['categories', 'parts', 'stocks', 'locations', 'transactions', 'projects', 'projectBoms', 'audits'].every((k) => Array.isArray(backup.data?.[k])))
  const totalBeforeDry = (await get('/parts')).data.total
  const dry = await post('/export/restore?dryRun=1', backup.data)
  ok('恢复预演不写库', dry.code === 0 && dry.data?.dryRun === true && (await get('/parts')).data.total === totalBeforeDry)
  ok('非法备份被拒绝', (await post('/export/restore', { foo: 1 })).status === 400)
  const restored = await post('/export/restore', backup.data)
  ok('合法备份覆盖恢复', restored.code === 0 && (await get('/parts')).data.total === totalBeforeDry)
  ok('系统元信息可查', (await get('/meta')).code === 0)
  ok('未知路由返回 404', (await get('/not-a-route')).status === 404)
  ok('不支持的方法返回 405', (await call('PATCH', '/categories')).status === 405)

  /* ---------------- M8 操作日志 ---------------- */
  section('M8 操作日志')
  const audits = await get('/audit?limit=500')
  ok('日志接口返回事件数组', audits.code === 0 && Array.isArray(audits.data) && audits.data.length > 0)
  const actions = new Set(audits.data.map((a) => a.action))
  ok('覆盖出入库 / 移库 / 导入 / 撤销 / 恢复',
    ['stock.in', 'stock.out', 'stock.move', 'import.commit', 'import.undo', 'backup.restore'].every((a) => actions.has(a)),
    [...actions].join(','))
  const inOnly = await get('/audit?action=stock.in')
  ok('按动作过滤生效', inOnly.code === 0 && inOnly.data.length > 0 && inOnly.data.every((a) => a.action === 'stock.in'))
  const byKeyword = await get('/audit?q=齐套电阻')
  ok('按器件关键词过滤生效', byKeyword.code === 0 && Array.isArray(byKeyword.data))
  ok('导出包含审计日志', backup.data.audits.length > 0)
}

main().catch((e) => { console.error('模块验证异常:', e); process.exit(1) })
