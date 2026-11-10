// tests/unit/run.mjs
// 后端逻辑单元测试：用 MemoryKV 真实调用仓储与用例，覆盖核心业务与边界。
// 运行：npm run test:unit
import { MemoryKV, EdgeOneKV } from '../../server/infrastructure/kv/index.js'
import { checkAuth } from '../../server/http/auth.js'
import { seedIfEmpty } from '../../server/infrastructure/seed.js'
import { DEFAULT_CATEGORIES } from '../../server/domain/models.js'
import { listParts } from '../../server/application/catalog.service.js'
import { stockIn, stockOut } from '../../server/application/stock.service.js'
import { countBackup, exportAll, importAll, validateBackup } from '../../server/application/backup.service.js'
import { listImportBatches, undoImport } from '../../server/application/import.service.js'
import { listAudits } from '../../server/repositories/audit.repository.js'
import { moveStock as moveStockWithAudit } from '../../server/application/inventory.service.js'
import { summarizeBom, METRIC_LABELS } from '../../server/domain/bom/summary.js'
import { buildParamTemplate } from '../../server/domain/param-template.js'
import { getStats } from '../../server/application/analytics.service.js'
import { listCategories, updateCategory } from '../../server/repositories/category.repository.js'
import { createPart, deletePart, getPart } from '../../server/repositories/part.repository.js'
import { createLocation } from '../../server/repositories/location.repository.js'
import { listStock, moveStock, partTotalQuantity } from '../../server/repositories/stock.repository.js'
import { listTransactions } from '../../server/repositories/transaction.repository.js'
import { planImport, commitImport } from '../../server/application/import.service.js'
import { parseBomText, matchBom, consumeBom } from '../../server/application/bom.service.js'
import {
  createProject, updateProject, deleteProject, getProjectDoc,
  saveProjectLines, importProjectBom, analyzeProject, consumeProject
} from '../../server/application/project.service.js'
import { buildPartQrText, buildLocationQrText, isPublicOrigin } from '../../server/domain/qr.js'
import { BRAND_TITLE, LEGACY_BRAND_TITLES } from '../../server/domain/brand.js'
import { parseScanPayload } from '../../server/domain/scan.js'
import { mapRow, detectPlatform } from '../../server/domain/import-map.js'
import { normalizePackage, parseSI, formatSI, eiaCode } from '../../server/domain/normalize.js'
import { suggestParamValues, suggestParamCombos, describeParamValue, extractParamQuery } from '../../server/domain/param-suggest.js'

// 统计分类树总节点数（顶级 + 嵌套子级），避免断言随模板增减而过期。
function countTree(nodes) {
  return nodes.reduce((n, c) => n + 1 + (c.children ? countTree(c.children) : 0), 0)
}
const TOTAL_CATS = countTree(DEFAULT_CATEGORIES)

let passed = 0
let failed = 0
function ok(name, cond, extra = '') {
  if (cond) { passed++; console.log(`  ✓ ${name}`) }
  else { failed++; console.log(`  ✗ ${name} ${extra}`) }
}

async function main() {
  const kv = new MemoryKV()
  await seedIfEmpty(kv)

  console.log('\n[1] 默认分类种子')
  const cats = await listCategories(kv)
  ok('默认顶级分类数量为 9', cats.filter((c) => !c.parentId).length === 9, `实际 ${cats.filter((c) => !c.parentId).length}`)
  ok('默认分类总节点数与模板一致', cats.length === TOTAL_CATS, `实际 ${cats.length}, 期望 ${TOTAL_CATS}`)
  const resistor = cats.find((c) => c.name === '电阻')
  ok('存在「电阻」分类且带参数模板', resistor && resistor.paramTemplate.length > 0)

  console.log('\n[2] 创建元器件 + 索引')
  const p1 = await createPart(kv, {
    name: '0805 10kΩ 电阻', categoryId: resistor.id, package: '0805',
    manufacturerModel: 'RC0805', params: { resistance: '10k', tolerance: '1%' },
    tags: ['常用'], suppliers: [{ platform: 'lcsc', sku: 'C123', price: 0.01 }]
  })
  ok('创建元器件返回 id', !!p1.id)
  const byTag = await listParts(kv, { tag: '常用' })
  ok('按标签索引可检索到', byTag.list.length === 1)
  const byCat = await listParts(kv, { categoryId: resistor.id })
  ok('按分类索引可检索到', byCat.list.length === 1)

  console.log('\n[3] 全文与表达式检索')
  const s1 = await listParts(kv, { search: 'C123' })
  ok('全文检索 供应商料号命中', s1.list.length === 1)
  const e1 = await listParts(kv, { expr: '10k 0805 1%' })
  ok('表达式 10k 0805 1% 命中', e1.list.length === 1)
  const e2 = await listParts(kv, { expr: '10k 1206' })
  ok('表达式 10k 1206 不命中', e2.list.length === 0)

  console.log('\n[3.1] 字段归一化与单位换算检索')
  ok('封装 1608 Metric → 0603', normalizePackage('1608 Metric') === '0603')
  ok('封装 0402 (1005 Metric) → 0402', normalizePackage('0402 (1005 Metric)') === '0402')
  ok('SOT23 → SOT-23', normalizePackage('SOT23') === 'SOT-23')
  ok('1000nF 解析为 1µF', formatSI(parseSI('1000nF').value, 'capacitance') === '1µF')
  ok('10kΩ 的 EIA 代码为 103', eiaCode(10000, 'resistance') === '103')
  ok('创建时参数 10k 归一为 10kΩ', p1.params.resistance === '10kΩ', `实际 ${p1.params.resistance}`)

  const capCat = cats.find((c) => c.name === '电容')
  const p2 = await createPart(kv, {
    name: '1µF 陶瓷电容', categoryId: capCat.id, package: '1608 Metric',
    params: { capacitance: '1000nF' }
  })
  ok('创建时 1000nF 归一为 1µF', p2.params.capacitance === '1µF', `实际 ${p2.params.capacitance}`)
  ok('创建时 1608 Metric 归一为 0603', p2.package === '0603', `实际 ${p2.package}`)
  const sCap = await listParts(kv, { search: '1000nF' })
  ok('搜索 1000nF 命中 1µF 电容', sCap.list.some((p) => p.id === p2.id))
  const sEia = await listParts(kv, { search: '1002' })
  ok('搜索 1002 命中 10kΩ 电阻', sEia.list.some((p) => p.id === p1.id))
  const sPkg = await listParts(kv, { search: '1608 Metric' })
  ok('搜索 1608 Metric 命中 0603 封装', sPkg.list.some((p) => p.id === p2.id))
  const sCatName = await listParts(kv, { search: '电容' })
  ok('可按分类名检索', sCatName.list.some((p) => p.id === p2.id))
  const sMiss = await listParts(kv, { search: '470nF' })
  ok('不相关容值不误命中', !sMiss.list.some((p) => p.id === p2.id))

  console.log('\n[4] 库存入库 / 出库 / 流水')
  await stockIn(kv, p1.id, { quantity: 100, unitPrice: 0.01, supplier: 'lcsc' })
  let total = await partTotalQuantity(kv, p1.id)
  ok('入库后总量 100', total === 100, `实际 ${total}`)
  const out = await stockOut(kv, p1.id, { quantity: 30, reason: '领料' })
  ok('出库成功', out.ok === true)
  total = await partTotalQuantity(kv, p1.id)
  ok('出库后总量 70', total === 70, `实际 ${total}`)
  const txns = await listTransactions(kv, p1.id)
  ok('生成 2 条流水（1入1出）', txns.length === 2)
  const overOut = await stockOut(kv, p1.id, { quantity: 999 })
  ok('超额出库被拒绝', overOut.ok === false)
  const zeroIn = await stockIn(kv, p1.id, { quantity: 0 })
  ok('入库数量 0 被拒绝', zeroIn.ok === false)
  const negIn = await stockIn(kv, p1.id, { quantity: -5 })
  ok('入库负数被拒绝', negIn.ok === false)
  total = await partTotalQuantity(kv, p1.id)
  ok('非法入库未产生批次', total === 70, `实际 ${total}`)
  // 列表需带库存合计与批次（列表页库存列依赖）
  const listed = await listParts(kv, { pageSize: 10 })
  const row1 = listed.list.find((p) => p.id === p1.id)
  ok('列表返回库存合计 70', row1 && row1.totalQuantity === 70, `实际 ${row1 && row1.totalQuantity}`)
  ok('列表返回批次数组', row1 && Array.isArray(row1.stocks) && row1.stocks.length === 1)
  const listedLite = await listParts(kv, { pageSize: 10, withQuantity: false })
  const liteRow = listedLite.list.find((p) => p.id === p1.id)
  ok('withQuantity:false 跳过库存合计', liteRow && liteRow.totalQuantity === undefined)

  console.log('\n[5] 导入匹配（去重）')
  const rows = [
    mapRow('lcsc', { '商品编号': 'C123', '商品名称': '0805 10kΩ 电阻', '封装': '0805', '数量': 50, '单价': 0.01 }),
    mapRow('lcsc', { '商品编号': 'C999', '商品名称': '新电容', '封装': '0402', '数量': 20, '单价': 0.05 })
  ]
  ok('识别平台为 lcsc', detectPlatform(Object.keys(rows[0].raw)) === 'lcsc')
  const plan = await planImport(kv, rows)
  const matched = plan.items.find((i) => i.index === 0)
  const created = plan.items.find((i) => i.index === 1)
  ok('C123 匹配到已有元器件', matched.action === 'match' && matched.partId === p1.id)
  ok('C999 判定为新建', created.action === 'create')
  const commit = await commitImport(kv, plan.items)
  ok('提交后 1 创建 1 匹配', commit.summary.created === 1 && commit.summary.matched === 1, JSON.stringify(commit.summary))
  total = await partTotalQuantity(kv, p1.id)
  ok('匹配入库后 p1 总量 120', total === 120, `实际 ${total}`)
  const newPart = await listParts(kv, { search: 'C999' })
  ok('新建元器件已落库', newPart.list.length === 1)

  console.log('\n[6] 统计看板')
  const stats = await getStats(kv)
  ok('统计包含分类/元器件计数', stats.categoriesCount === TOTAL_CATS && stats.partsCount >= 2)
  ok('库存总价值 > 0', stats.totalValue > 0, `实际 ${stats.totalValue}`)

  console.log('\n[7] 删除元器件与索引清理')
  const del = await deletePart(kv, p1.id)
  ok('删除成功', del.ok === true)
  const after = await listParts(kv, { tag: '常用' })
  ok('删除后标签索引已清理', after.list.length === 0)

  console.log('\n[8] 导出 / 导入 备份')
  const exp = await exportAll(kv)
  ok('导出包含各部分', exp.categories.length === TOTAL_CATS && exp.parts.length >= 1)
  const kv2 = new MemoryKV()
  await importAll(kv2, exp)
  const exp2 = await exportAll(kv2)
  ok('导入备份后数据一致', exp2.parts.length === exp.parts.length && exp2.categories.length === TOTAL_CATS)

  console.log('\n[9] 三级去重：参数 + 封装疑似重复')
  const kv3 = new MemoryKV()
  await seedIfEmpty(kv3)
  const rcat3 = (await listCategories(kv3)).find((c) => c.name === '电阻')
  const exist = await createPart(kv3, {
    name: '0603 10kΩ 电阻', categoryId: rcat3.id, package: '0603(1608)',
    params: { resistance: '10kΩ', tolerance: '±1%' }
  })
  const rows3 = [mapRow('lcsc', {
    '商品编号': 'C777', '商品名称': '【全新原装】0603 10K 1% 电阻 包邮',
    '封装': '1608 Metric', '数量': 100, '单价': 0.01
  })]
  ok('导入行封装归一为 0603', rows3[0].package === '0603', `实际 ${rows3[0].package}`)
  ok('导入行自动识别阻值', rows3[0].params.resistance === '10kΩ', `实际 ${rows3[0].params.resistance}`)
  ok('导入行清洗营销词', !rows3[0].name.includes('包邮') && !rows3[0].name.includes('全新'), `实际 ${rows3[0].name}`)
  const plan3 = await planImport(kv3, rows3)
  const it3 = plan3.items[0]
  ok('无料号无型号时仍提示疑似重复', it3.action === 'create' && !!it3.similar, JSON.stringify(it3.similar))
  ok('疑似重复指向已有元器件', it3.similar?.partId === exist.id)
  const merged = { ...it3, action: 'match', partId: it3.similar.partId, partName: it3.similar.partName }
  const c3 = await commitImport(kv3, [merged])
  ok('用户确认并入后走匹配入库', c3.summary.matched === 1 && c3.summary.created === 0, JSON.stringify(c3.summary))
  const qty3 = await partTotalQuantity(kv3, exist.id)
  ok('并入后库存累加 100', qty3 === 100, `实际 ${qty3}`)

  console.log('\n[10] 服务端兜底归一（跳过前端映射直接调 API）')
  const rawPlan = await planImport(kv3, [{
    platform: 'lcsc', sku: '', name: '0402 100nF 50V 陶瓷电容',
    manufacturerModel: '', package: '1005 Metric', params: { capacitance: '100nF' },
    quantity: 10, unitPrice: 0.01, orderNo: 'RAW-001'
  }])
  ok('原始行封装 1005 Metric 归一为 0402', rawPlan.items[0].row.package === '0402', `实际 ${rawPlan.items[0].row.package}`)
  ok('原始行自动识别分类', !!rawPlan.items[0].partData.categoryId)
  const c4 = await commitImport(kv3, [rawPlan.items[0]])
  const created4 = await getPart(kv3, c4.created[0])
  const stock4 = (await listStock(kv3, created4.id))[0]
  ok('导入批次来源记录为「立创」', stock4.supplier === '立创', `实际 ${stock4.supplier}`)
  ok('导入批次保留订单号与单价', stock4.orderNo === 'RAW-001' && stock4.unitPrice === 0.01)

  console.log('\n[11] BOM 齐套：解析 / 匹配 / 出库')
  const kv5 = new MemoryKV()
  await seedIfEmpty(kv5)
  const cats5 = await listCategories(kv5)
  const resCat5 = cats5.find((c) => c.name === '电阻')
  const mcuCat5 = cats5.find((c) => c.name === 'MCU/单片机') || cats5.find((c) => c.name === '芯片/MCU')

  const bomText = [
    '位号\t型号\t名称\t封装\t数量',
    'R1,R2\tRC0805FR-0710KL\t10kΩ 电阻\t0603\t2',
    'U1\tSTM32F103C8T6\tMCU\tLQFP-48\t1',
    'R9\tRC0805FR-0710KL\t10kΩ 电阻\t0603\t3',
    'C1\tGRM188R71H104KA93D\t100nF 电容\t0603\t10',
    'R5\tRC0805FR-0710KL\t10kΩ 电阻\t0603\t8'
  ].join('\n')
  const parsed = parseBomText(bomText)
  ok('识别表头', parsed.headerDetected === true)
  ok('解析出 5 行', parsed.rows.length === 5, `实际 ${parsed.rows.length}`)
  ok('中文封装列归一为 0603', parsed.rows[0].package === '0603', `实际 ${parsed.rows[0].package}`)
  ok('数量解析为数字', parsed.rows[1].required === 1, `实际 ${parsed.rows[1].required}`)

  const noHeader = parseBomText('R1,R2\t10kΩ\t0603\t2\nU1\tSTM32F103C8T6\tLQFP-48\t1')
  ok('无表头按列推断（4 列）', noHeader.rows[0].model === '10kΩ' && noHeader.rows[0].package === '0603', JSON.stringify(noHeader.rows[0]))
  ok('无表头 3 列按 型号+封装+数量', noHeader.rows[1].model === 'STM32F103C8T6' && noHeader.rows[1].required === 1)

  const pR = await createPart(kv5, {
    name: '0603 10kΩ 电阻', categoryId: resCat5.id, package: '0603',
    manufacturerModel: 'RC0805FR-0710KL', safetyStock: 50, params: { resistance: '10kΩ', tolerance: '±1%' }
  })
  await stockIn(kv5, pR.id, { quantity: 5, unitPrice: 0.01, supplier: '立创', locationId: null })
  const pU = await createPart(kv5, {
    name: 'STM32F103C8T6', categoryId: mcuCat5 ? mcuCat5.id : null, package: 'LQFP-48',
    manufacturerModel: 'STM32F103C8T6'
  })
  await stockIn(kv5, pU.id, { quantity: 3, unitPrice: 6.5 })

  const { lines, summary } = await matchBom(kv5, parsed.rows)
  const lineR1 = lines.find((l) => l.designators === 'R1,R2')
  const lineR5 = lines.find((l) => l.designators === 'R5')
  const lineU1 = lines.find((l) => l.designators === 'U1')
  const lineC1 = lines.find((l) => l.designators === 'C1')
  ok('型号精确匹配到已有器件', lineR1.partId === pR.id, `实际 ${lineR1.partId}`)
  ok('库存充足标记 ok', lineR1.status === 'ok', `状态 ${lineR1.status}`)
  ok('库存不足标记 short 且缺口正确', lineR5.status === 'short' && lineR5.shortage === 3, `状态 ${lineR5.status} 缺口 ${lineR5.shortage}`)
  ok('库存充足标记 ok（MCU）', lineU1.status === 'ok' && lineU1.shortage === 0, `状态 ${lineU1.status}`)
  ok('未建档行标记 missing', lineC1.status === 'missing' && lineC1.needCreate === true)
  ok('未建档行给出模糊候选', Array.isArray(lineC1.candidates))
  ok('汇总统计未建档 1 行', summary.missingLines === 1, `实际 ${summary.missingLines}`)
  ok('汇总需求总量为 24', summary.requiredQty === 24, `实际 ${summary.requiredQty}`)
  ok('汇总缺口含未建档（3+10=13）', summary.shortageQty === 13, `实际 ${summary.shortageQty}`)

  // 同一器件出现在多行：按合计出库，避免逐行扣减导致第二行不足
  await stockIn(kv5, pR.id, { quantity: 5 })
  const consume = await consumeBom(kv5, [lineR1, lines.find((l) => l.designators === 'R9')], { projectName: '测试板 V1' })
  ok('多行同器件合并出库成功', consume.ok === true && consume.totalOut === 5, JSON.stringify(consume.failed))
  const qtyAfter = await partTotalQuantity(kv5, pR.id)
  ok('出库后库存扣减到 5', qtyAfter === 5, `实际 ${qtyAfter}`)
  const txns5 = await listTransactions(kv5, pR.id, 10)
  ok('流水记录项目名', txns5.some((t) => t.reason.includes('测试板 V1')))

  console.log('\n[8] 项目 BOM')
  const kv6 = new MemoryKV()
  await seedIfEmpty(kv6)
  const cats6 = await listCategories(kv6)
  const resCat6 = cats6.find((c) => c.name === '电阻')
  const pR6 = await createPart(kv6, {
    name: '0603 10kΩ 电阻', categoryId: resCat6.id, package: '0603',
    manufacturerModel: 'RC0805FR-0710KL', params: { resistance: '10kΩ', tolerance: '±1%' }
  })
  await stockIn(kv6, pR6.id, { quantity: 100, unitPrice: 0.01 })
  const pU6 = await createPart(kv6, {
    name: 'STM32F103C8T6', categoryId: null, package: 'LQFP-48',
    manufacturerModel: 'STM32F103C8T6', params: { voltage: '3.3V' }
  })
  await stockIn(kv6, pU6.id, { quantity: 2, unitPrice: 6.5 })

  const created6 = await createProject(kv6, {
    name: '温控板', code: 'PRJ-001', buildQty: 5,
    lines: [
      { designators: 'R1,R2', model: 'RC0805FR-0710KL', quantity: 2 },
      { designators: 'U1', model: 'STM32F103C8T6', quantity: 1 }
    ]
  })
  ok('创建项目成功', created6.ok === true && !!created6.project.id)
  ok('项目 BOM 两行且已匹配器件', created6.lines.length === 2 && created6.lines.every((l) => l.partId), JSON.stringify(created6.lines))
  ok('项目缓存行数', created6.project.lineCount === 2, `实际 ${created6.project.lineCount}`)

  const an6 = await analyzeProject(kv6, created6.project.id)
  const lineR6 = an6.lines.find((l) => l.designators === 'R1,R2')
  const lineU6 = an6.lines.find((l) => l.designators === 'U1')
  ok('单套用量 × 套数 = 需求（2×5=10）', lineR6.required === 10, `实际 ${lineR6.required}`)
  ok('充足行标记 ok', lineR6.status === 'ok' && lineR6.shortage === 0)
  ok('不足行标记 short 且缺口 3', lineU6.status === 'short' && lineU6.shortage === 3, `${lineU6.status}/${lineU6.shortage}`)
  ok('齐套率按数量计算为 80%', an6.summary.completeness === 80, `实际 ${an6.summary.completeness}`)

  const up6 = await updateProject(kv6, created6.project.id, { buildQty: 1, status: 'pilot' })
  ok('更新项目套数与状态', up6.ok && up6.project.buildQty === 1 && up6.project.status === 'pilot')
  const an6b = await analyzeProject(kv6, created6.project.id)
  ok('套数改为 1 后 MCU 变为充足', an6b.lines.find((l) => l.designators === 'U1').status === 'ok')

  const imp6 = await importProjectBom(kv6, created6.project.id, {
    text: '位号\t型号\t封装\t数量\nR9\tRC0805FR-0710KL\t0603\t4\nU1\tSTM32F103C8T6\tLQFP-48\t1',
    mode: 'replace'
  })
  ok('导入 BOM 覆盖原行（2 行）', imp6.ok && imp6.lines.length === 2, JSON.stringify(imp6.lines))
  ok('导入后行绑定已有器件', imp6.lines.every((l) => l.partId))

  const cons6 = await consumeProject(kv6, created6.project.id, {})
  ok('项目领料出库成功', cons6.ok === true && cons6.totalOut === 5, JSON.stringify(cons6.failed))
  ok('需求行全部出库', cons6.success.length === 2, `实际 ${cons6.success.length}`)
  const txns6 = await listTransactions(kv6, pR6.id, 10)
  ok('流水写入项目归属', txns6.some((t) => t.projectId === created6.project.id && t.projectName === '温控板'))
  const qtyR6 = await partTotalQuantity(kv6, pR6.id)
  ok('领料后库存正确扣减（100-4=96）', qtyR6 === 96, `实际 ${qtyR6}`)

  const del6 = await deleteProject(kv6, created6.project.id)
  const gone6 = await getProjectDoc(kv6, created6.project.id)
  ok('删除项目同时清理 BOM', del6.ok === true && gone6 === null)

  console.log('\n[9] 二维码内容')
  const qrFull = buildPartQrText({ ...pR6, brand: 'YAGEO', internalNo: 'R-0001' }, {
    categoryName: '电阻', paramLabels: { resistance: '阻值', tolerance: '精度' },
    quantity: 96, locationPath: 'A柜 / 01层 / 电阻盒', mode: 'full', origin: 'https://parts.example.com'
  })
  ok('完整码包含名称与型号', qrFull.includes('0603 10kΩ 电阻') && qrFull.includes('RC0805FR-0710KL'))
  ok('完整码包含参数标签', qrFull.includes('阻值：10kΩ') && qrFull.includes('精度：±1%'))
  ok('完整码包含库存与库位', qrFull.includes('库存 96') && qrFull.includes('A柜 / 01层 / 电阻盒'))
  ok('完整码包含详情链接', qrFull.includes('https://parts.example.com/#/p/' + pR6.id))
  const qrBrief = buildPartQrText(pR6, { quantity: 96, locationPath: 'A柜 / 01层 / 电阻盒', mode: 'compact' })
  ok('简版码行数不超过 8', qrBrief.split('\n').length <= 8, `实际 ${qrBrief.split('\n').length}`)
  ok('简版码压缩库位', qrBrief.includes('库位 01层/电阻盒'))
  ok('localhost 不追加详情链接', !isPublicOrigin('http://127.0.0.1:5173') && isPublicOrigin('https://parts.example.com'))
  ok('构造函数拒绝本地详情链接（器件码）',
    !buildPartQrText(pR6, { quantity: 1, mode: 'full', origin: 'http://127.0.0.1:5173' }).includes('127.0.0.1'))
  ok('构造函数拒绝本地详情链接（库位码）',
    !buildLocationQrText({ id: 'loc_local', name: '电阻盒' }, { path: 'A柜', origin: 'http://localhost:5173' }).includes('localhost'))
  const locQr = buildLocationQrText({ id: 'loc_1', name: '电阻盒', code: 'A-01' }, {
    path: 'A柜 / 01层 / 电阻盒', partKinds: 12, quantity: 340
  })
  ok('库位码包含路径与统计', locQr.includes('A柜 / 01层 / 电阻盒') && locQr.includes('12 种 / 340 件'))

  console.log('\n[10] 扫码内容解析')
  const partQrFull = buildPartQrText({ ...pR6, brand: 'YAGEO', internalNo: 'R-0001' }, {
    categoryName: '电阻', paramLabels: { resistance: '阻值' },
    quantity: 96, locationPath: 'A柜 / 01层 / 电阻盒', mode: 'full'
  })
  const sc1 = parseScanPayload(partQrFull)
  ok('器件码识别为 part', sc1.kind === 'part', JSON.stringify(sc1))
  ok('提取名称与型号', sc1.name === '0603 10kΩ 电阻' && sc1.model === 'RC0805FR-0710KL', `${sc1.name}/${sc1.model}`)
  ok('提取参数与库存', sc1.params?.阻值 === '10kΩ' && sc1.quantity === 96, JSON.stringify(sc1.params))
  ok('提取库位路径', sc1.locationPath === 'A柜 / 01层 / 电阻盒', sc1.locationPath)
  const sc2 = parseScanPayload(buildPartQrText(pR6, { quantity: 96, locationPath: 'A柜/01层/电阻盒', mode: 'compact' }))
  ok('简版码同样可识别', sc2.kind === 'part' && sc2.model === pR6.manufacturerModel, JSON.stringify(sc2))
  const sc3 = parseScanPayload(`https://parts.example.com/#/p/${pR6.id}`)
  ok('详情链接解析器件 id', sc3.kind === 'part' && sc3.id === pR6.id)
  const sc4 = parseScanPayload(JSON.stringify({ partId: pR6.id, name: '外部系统料' }))
  ok('JSON 解析器件 id', sc4.kind === 'part' && sc4.id === pR6.id)
  const sc5 = parseScanPayload(buildLocationQrText({ id: 'loc_1', name: '电阻盒', code: 'A-01' }, {
    path: 'A柜 / 01层 / 电阻盒', partKinds: 12, quantity: 340
  }))
  ok('库位码识别编码与路径', sc5.kind === 'location' && sc5.code === 'A-01' && sc5.path === 'A柜 / 01层 / 电阻盒', JSON.stringify(sc5))
  const sc6 = parseScanPayload('https://x.example.com/#/locations?focus=loc_9')
  ok('库位链接解析 id', sc6.kind === 'location' && sc6.id === 'loc_9')
  const sc7 = parseScanPayload('C2044471')
  ok('纯条码降级为检索词', sc7.kind === 'query' && sc7.query === 'C2044471')
  const sc8 = parseScanPayload(JSON.stringify({ type: 'location', id: 'loc_2', code: 'B-02' }))
  ok('JSON 库位识别', sc8.kind === 'location' && sc8.id === 'loc_2')

  console.log('\n[10b] 品牌改名后的标签兼容')
  ok('新二维码使用新品牌名', qrFull.includes(BRAND_TITLE) && !qrFull.includes(LEGACY_BRAND_TITLES[0]), BRAND_TITLE)
  const legacyQr = qrFull.replace(BRAND_TITLE, LEGACY_BRAND_TITLES[0])
  const scLegacy = parseScanPayload(legacyQr)
  ok('旧品牌名二维码仍识别为器件', scLegacy.kind === 'part' && scLegacy.model === 'RC0805FR-0710KL', JSON.stringify(scLegacy))
  const legacyLoc = locQr.replace(BRAND_TITLE, LEGACY_BRAND_TITLES[0])
  const scLegacyLoc = parseScanPayload(legacyLoc)
  ok('旧品牌名库位码仍识别为库位', scLegacyLoc.kind === 'location' && scLegacyLoc.code === 'A-01', JSON.stringify(scLegacyLoc))

  console.log('\n[11] 移动库存位置')
  const locMoveA = await createLocation(kv, { name: '测试柜 A', code: 'T-A' })
  const locMoveB = await createLocation(kv, { name: '测试柜 B', code: 'T-B' })
  const pMove = await createPart(kv, { name: '移动测试电阻', package: '0603' })
  const inMove = await stockIn(kv, pMove.id, { quantity: 50, locationId: locMoveA.id, unitPrice: 0.01 })
  ok('入库批次带位置', inMove.ok && inMove.stock.locationId === locMoveA.id)
  const mv1 = await moveStock(kv, { partId: pMove.id, locationId: locMoveB.id })
  ok('整颗料移动到新位置', mv1.ok && mv1.moved === 1, JSON.stringify(mv1))
  const stockAfterMove = await listStock(kv, pMove.id)
  ok('批次位置已更新', stockAfterMove[0].locationId === locMoveB.id)
  const mv2 = await moveStock(kv, { partId: pMove.id, locationId: locMoveB.id })
  ok('位置未变化时幂等返回', mv2.ok && mv2.unchanged === true && mv2.moved === 0, JSON.stringify(mv2))
  const mvBad = await moveStock(kv, { partId: pMove.id, locationId: 'not-exist' })
  ok('目标位置不存在被拒绝', mvBad.ok === false)
  const mvNoPart = await moveStock(kv, { partId: 'not-exist', locationId: locMoveB.id })
  ok('元器件不存在被拒绝', mvNoPart.ok === false)
  const qtyAfterMove = await partTotalQuantity(kv, pMove.id)
  ok('移动不改变库存数量', qtyAfterMove === 50, `实际 ${qtyAfterMove}`)

  console.log('\n[12] 统计口径共享函数')
  const emptySummary = summarizeBom([])
  ok('空 BOM 全部归零', emptySummary.lineCount === 0 && emptySummary.completeness === 0 && emptySummary.coverage === 0)
  const okSummary = summarizeBom([
    { partId: 'p1', status: 'ok', required: 10, available: 20, shortage: 0 }
  ])
  ok('全齐套：齐套率 100% / 匹配率 100% / 缺料 0',
    okSummary.completeness === 100 && okSummary.coverage === 100 && okSummary.shortageLines === 0)
  const shortSummary = summarizeBom([
    { partId: 'p1', status: 'short', required: 10, available: 4, shortage: 6 },
    { partId: null, status: 'missing', required: 10, available: 0, shortage: 10 }
  ])
  ok('部分缺料按件数给 credit', shortSummary.completeness === 20, `实际 ${shortSummary.completeness}`)
  ok('缺料行不含未建档', shortSummary.shortageLines === 1, `实际 ${shortSummary.shortageLines}`)
  ok('缺料行含未建档 = 2', shortSummary.shortageLinesIncludingUnlinked === 2, `实际 ${shortSummary.shortageLinesIncludingUnlinked}`)
  ok('未建档行与匹配率按行计算', shortSummary.missingLines === 1 && shortSummary.coverage === 50)
  ok('展示标签集中定义', METRIC_LABELS.completeness.includes('件') && METRIC_LABELS.coverage.includes('行'))

  console.log('\n[13] 分类参数模板 key')
  const tpl = buildParamTemplate([
    { label: '阻值', type: 'text' },
    { label: '额定功率', type: 'number', unit: 'W' },
    { label: '精度', type: 'enum', options: ['±1%', ''] }
  ])
  ok('纯中文标签生成非空 key', tpl.length === 3 && tpl.every((f) => f.key && f.key.length > 0))
  ok('中文 key 互不相同', new Set(tpl.map((f) => f.key)).size === 3, tpl.map((f) => f.key).join(','))
  ok('中文 key 保留原字符', tpl[0].key === '阻值', tpl[0].key)
  ok('单位与枚举选项保留', tpl[1].unit === 'W' && tpl[2].options.length === 1)
  const mixed = buildParamTemplate([{ label: 'ESR @100kHz' }, { label: 'ESR @100kHz' }, { label: '###' }, { label: '   ' }])
  ok('中英混排归一为连字符', mixed[0].key === 'esr-100khz', mixed[0].key)
  ok('重名自动编号', mixed[1].key === 'esr-100khz_2', mixed[1].key)
  ok('纯符号与空标签兜底', mixed[2].key === 'param' && mixed.length === 3, JSON.stringify(mixed))
  const kept = buildParamTemplate([{ key: 'legacy_key', label: '改过名的字段' }])
  ok('已有 key 优先沿用', kept[0].key === 'legacy_key')

  console.log('\n[14] 备份结构校验')
  const badA = validateBackup({})
  ok('缺 parts 被拦截', badA.errors.some((e) => e.includes('parts')))
  const badB = validateBackup({ parts: 'x' })
  ok('parts 非数组被拦截', badB.errors.some((e) => e.includes('数组')))
  const badC = validateBackup({ parts: [{ id: 'p1' }, { id: 'p1' }] })
  ok('重复 id 被拦截', badC.errors.some((e) => e.includes('重复')))
  const warnCase = validateBackup({ parts: [{ id: 'p1' }], stocks: [{ id: 's1', partId: 'ghost' }] })
  ok('合法结构放行，孤儿引用给警告', warnCase.errors.length === 0 && warnCase.warnings.length > 0)
  const counted = countBackup({ parts: [1, 2], stocks: [1], locations: [1, 2, 3] })
  ok('预演计数准确', counted.parts === 2 && counted.stocks === 1 && counted.locations === 3)

  console.log('\n[15] 扫码合并与审计日志')
  const kvAudit = new MemoryKV()
  await seedIfEmpty(kvAudit)
  const pScan = await createPart(kvAudit, { name: '扫码合并电阻', package: '0603' })
  const locScan = await createLocation(kvAudit, { name: '扫码柜', code: 'S-1' })
  await stockIn(kvAudit, pScan.id, { quantity: 1, locationId: locScan.id, unitPrice: 0.02, source: 'scan' })
  const in2 = await stockIn(kvAudit, pScan.id, { quantity: 2, locationId: locScan.id, unitPrice: 0.02, source: 'scan', merge: true })
  ok('第二次扫码合并到同一批次', in2.merged === true, JSON.stringify(in2))
  ok('合并后只有一个批次', (await listStock(kvAudit, pScan.id)).length === 1)
  ok('合并后数量累加为 3', await partTotalQuantity(kvAudit, pScan.id) === 3)
  const txnScan = (await listTransactions(kvAudit, pScan.id)).find((t) => t.quantity === 2)
  ok('流水带来源与变动前后数量',
    txnScan?.source === 'scan' && txnScan?.beforeQty === 1 && txnScan?.afterQty === 3, JSON.stringify(txnScan))
  await stockOut(kvAudit, pScan.id, { quantity: 1, source: 'scan' })
  const locScan2 = await createLocation(kvAudit, { name: '扫码柜 B', code: 'S-2' })
  await moveStockWithAudit(kvAudit, { partId: pScan.id, locationId: locScan2.id, source: 'scan' })
  const audits = await listAudits(kvAudit)
  const actions = new Set(audits.map((a) => a.action))
  ok('审计日志覆盖入库 / 出库 / 移库',
    actions.has('stock.in') && actions.has('stock.out') && actions.has('stock.move'), [...actions].join(','))
  ok('审计事件记录来源与器件', audits.every((a) => a.source === 'scan' && a.partId === pScan.id))

  console.log('\n[16] 导入批次撤销')
  const kvUndo = new MemoryKV()
  await seedIfEmpty(kvUndo)
  const before = (await listParts(kvUndo)).total
  const committed = await commitImport(kvUndo, [
    { index: 0, action: 'create', partData: { name: '撤销测试电容', package: '0603' }, row: { quantity: 7, unitPrice: 0.1 } }
  ])
  ok('提交返回 batchId', Boolean(committed.batchId), JSON.stringify(committed))
  ok('导入后器件数 +1', (await listParts(kvUndo)).total === before + 1)
  const batches = await listImportBatches(kvUndo)
  ok('批次列表可撤销', batches.some((b) => b.id === committed.batchId && b.undoable))
  const undone = await undoImport(kvUndo, committed.batchId)
  ok('撤销成功并删除新建对象', undone.ok && undone.removed.parts === 1 && undone.removed.stocks === 1, JSON.stringify(undone))
  ok('撤销后器件数恢复', (await listParts(kvUndo)).total === before)
  ok('重复撤销被拒绝', (await undoImport(kvUndo, committed.batchId)).ok === false)
  ok('撤销动作写入审计', (await listAudits(kvUndo)).some((a) => a.action === 'import.undo'))

  console.log('\n[17] 恢复失败整体回滚')
  const kvRollback = new MemoryKV()
  await seedIfEmpty(kvRollback)
  const pKeep = await createPart(kvRollback, { name: '恢复前应保留的器件', package: '0805' })
  const backup = await exportAll(kvRollback)
  await stockIn(kvRollback, pKeep.id, { quantity: 12 })
  class FailingKV extends MemoryKV {
    constructor(base) { super(); this.map = new Map(base.map); this.failKey = null; this.failOnce = true }
    async put(key, value) {
      // 只在第一次写入目标键时失败，之后允许回滚写入
      if (key === this.failKey && this.failOnce) { this.failOnce = false; throw new Error('模拟写入失败') }
      return super.put(key, value)
    }
  }
  const failing = new FailingKV(kvRollback)
  failing.failKey = `part:${backup.parts[0].id}`
  let rollbackErr = null
  try { await importAll(failing, backup) } catch (e) { rollbackErr = e }
  ok('写入失败会抛错', Boolean(rollbackErr))
  ok('失败后库存回滚到 12', await partTotalQuantity(failing, pKeep.id) === 12)
  ok('失败后器件记录仍在', Boolean(await getPart(failing, pKeep.id)))
  ok('回滚写入未被失败键阻断', failing.failOnce === false)

  console.log('\n[18] 参数取值建议')
  const R = { key: 'resistance', label: '阻值', unit: 'Ω' }
  const C = { key: 'capacitance', label: '容值', unit: 'F' }
  ok('输入 10k 首选 10kΩ', suggestParamValues(R, '10k')[0] === '10kΩ')
  ok('输入 10k 不乱命中 110kΩ', !suggestParamValues(R, '10k', 8).includes('110kΩ'))
  ok('输入 4R7 首选 4.7Ω', suggestParamValues(R, '4R7')[0] === '4.7Ω')
  ok('输入 103 按 EIA 解释为 10kΩ', describeParamValue(R, '103').includes('= 10kΩ'))
  ok('输入 220 按字面值解释为 220Ω', suggestParamValues(R, '220')[0] === '220Ω')
  ok('电容输入 100n 首选 100nF', suggestParamValues(C, '100n')[0] === '100nF')
  ok('电容输入 104 按 EIA 解释为 100nF', describeParamValue(C, '104').includes('100nF'))
  ok('电压输入 3.3 首选 3.3V', suggestParamValues({ key: 'voltage', label: '耐压', unit: 'V' }, '3.3')[0] === '3.3V')
  ok('精度建议首选 ±1%', suggestParamValues({ key: 'tolerance', label: '精度' }, '1')[0] === '±1%')
  ok('封装建议含 0603', suggestParamValues({ key: 'package', label: '封装' }, '060').includes('0603'))
  ok('空输入给出常用值', suggestParamValues(R, '').includes('10kΩ'))

  console.log('\n[19] 整器件规格快选')
  const R_TPL = [
    { key: 'resistance', label: '阻值', type: 'text', unit: 'Ω' },
    { key: 'power', label: '功率', type: 'text', unit: 'W' },
    { key: 'tolerance', label: '精度', type: 'enum', options: ['±0.1%', '±0.5%', '±1%', '±5%'] }
  ]
  const comboR = suggestParamCombos(R_TPL, { resistance: '10k' })
  ok('电阻输入 10k 生成整规格组合', comboR.length > 0 && comboR[0].label.startsWith('10kΩ'), comboR[0]?.label)
  ok('电阻组合同时填入精度与功耗', comboR[0].values.tolerance === '±1%' && comboR[0].values.power === '1/4W', JSON.stringify(comboR[0]?.values))
  const C_TPL = [
    { key: 'capacitance', label: '容值', type: 'text', unit: 'F' },
    { key: 'voltage', label: '耐压', type: 'text', unit: 'V' },
    { key: 'tolerance', label: '精度', type: 'enum', options: ['±1%', '±5%', '±10%', '±20%'] },
    { key: 'material', label: '材质', type: 'enum', options: ['陶瓷', '电解'] }
  ]
  const comboC = suggestParamCombos(C_TPL, { capacitance: '100n' })
  ok('电容组合含容值+耐压+精度', comboC[0]?.label.includes('100nF') && comboC[0]?.label.includes('50V') && comboC[0]?.label.includes('%'), comboC[0]?.label)
  ok('电容组合不写入材质字段', !('material' in (comboC[0]?.values || {})))
  ok('无主参数模板不生成组合', suggestParamCombos([{ key: 'spec', label: '规格', type: 'text' }], {}).length === 0)
  ok('从名称提取 10kΩ', extractParamQuery('0805 10kΩ 电阻') === '10kΩ')
  ok('从名称提取 100nf', extractParamQuery('0603 100nf 电容') === '100nf')
  ok('型号串不误提取规格', extractParamQuery('STM32F103C8T6') === '')
  const comboByName = suggestParamCombos(C_TPL, {}, 10, extractParamQuery('0603 100nf 电容'))
  ok('名称里写 100nf 也能生成电容组合', comboByName[0]?.label.includes('100nF'), comboByName[0]?.label)

  console.log('\n[20] 内置模板升级')
  const kvUp = new MemoryKV()
  await seedIfEmpty(kvUp)
  const capUp = (await listCategories(kvUp)).find((c) => c.name === '电容')
  await updateCategory(kvUp, capUp.id, {
    paramTemplate: capUp.paramTemplate.filter((p) => p.key !== 'tolerance')
  })
  const metaUp = JSON.parse(await kvUp.get('meta:info'))
  delete metaUp.templateVersion
  await kvUp.put('meta:info', JSON.stringify(metaUp))
  await seedIfEmpty(kvUp)
  const capUp2 = (await listCategories(kvUp)).find((c) => c.name === '电容')
  ok('旧数据自动补齐电容精度字段', capUp2.paramTemplate.some((p) => p.key === 'tolerance'))

  console.log('\n[21] EdgeOne KV 适配器')
  // 模拟 EdgeOne 绑定：key 仅允许字母/数字/下划线，list 单页上限 256 且返回 { key } 结构
  class FakeEdgeBinding {
    constructor() { this.map = new Map() }
    check(key) {
      if (!/^[A-Za-z0-9_]+$/.test(key)) throw new Error('非法 KV key: ' + key)
    }
    async get(key) { this.check(key); return this.map.get(key) ?? null }
    async put(key, value) { this.check(key); this.map.set(key, value) }
    async delete(key) { this.check(key); this.map.delete(key) }
    async list({ prefix = '', limit = 256, cursor } = {}) {
      this.check(prefix)
      if (limit > 256) throw new Error('limit 超过 EdgeOne 上限')
      const all = [...this.map.keys()].filter((k) => k.startsWith(prefix)).sort()
      const start = cursor ? all.indexOf(cursor) : 0
      const page = all.slice(start, start + limit)
      const end = start + page.length
      return {
        keys: page.map((k) => ({ key: k })),
        cursor: end < all.length ? all[end] : null,
        complete: end >= all.length
      }
    }
  }
  const edgeKV = new EdgeOneKV(new FakeEdgeBinding())
  await edgeKV.put('part:p1', 'R1')
  ok('业务 key 被编码为合法字符', [...edgeKV.kv.map.keys()].every((k) => /^[A-Za-z0-9_]+$/.test(k)))
  ok('读回业务数据', await edgeKV.get('part:p1') === 'R1')
  ok('列表还原为业务 key', (await edgeKV.list('part:')).keys.join(',') === 'part:p1')
  await edgeKV.put('index:parts:tag:贴片 电阻', '["p1"]')
  ok('中文/空格标签 key 可写入并前缀检索',
    (await edgeKV.list('index:parts:tag:')).keys.includes('index:parts:tag:贴片 电阻'))
  // 批量超过 256 条，适配器应自动分页并用业务 key 返回
  for (let i = 0; i < 300; i++) await edgeKV.put(`txn:${String(i).padStart(4, '0')}`, 'x')
  const many = await edgeKV.list('txn:', { limit: 1000 })
  ok('list 自动限制到 256 并分页', many.keys.length === 256 && many.done === false, `实际 ${many.keys.length}`)
  const allTxn = []
  let cursor = null
  let guard = 0
  do {
    const page = await edgeKV.list('txn:', { limit: 1000, cursor })
    allTxn.push(...page.keys)
    cursor = page.cursor
    guard++
  } while (cursor && guard < 10)
  ok('分页遍历拿到全部 300 条', allTxn.length === 300 && new Set(allTxn).size === 300, `实际 ${allTxn.length}`)
  await edgeKV.del('part:p1')
  ok('删除后读不到', await edgeKV.get('part:p1') === null)

  console.log('\n[22] 生产鉴权 fail-closed')
  const noToken = new Request('https://example.com/api/meta')
  const goodToken = new Request('https://example.com/api/meta', { headers: { 'X-Auth-Token': 'secret' } })
  const badToken = new Request('https://example.com/api/meta', { headers: { 'X-Auth-Token': 'wrong' } })
  ok('绑定 KV 但漏配 AUTH_TOKEN 时拒绝', checkAuth(noToken, { KV: {} }).ok === false)
  ok('绑定 KV 且令牌正确时放行', checkAuth(goodToken, { KV: {}, AUTH_TOKEN: 'secret' }).ok === true)
  ok('绑定 KV 且令牌错误时拒绝', checkAuth(badToken, { KV: {}, AUTH_TOKEN: 'secret' }).ok === false)
  ok('本地无 KV 时保持免密', checkAuth(noToken, { memory: true }).ok === true)
  ok('AUTH_DISABLED 仍可开发免密', checkAuth(noToken, { KV: {}, AUTH_DISABLED: '1' }).ok === true)

  console.log('\n[23] EdgeOne 入口连通性')
  const { default: edgeOnRequest } = await import('../../edge-functions/api/[[default]].js')
  const edgeEntryRes = await edgeOnRequest({
    request: new Request('https://example.com/api/meta', { headers: { 'X-Auth-Token': 'secret' } }),
    env: { KV: new FakeEdgeBinding(), AUTH_TOKEN: 'secret' }
  })
  const edgeEntryBody = await edgeEntryRes.json()
  ok('入口默认导出 onRequest 并复用统一路由', edgeEntryRes.status === 200 && edgeEntryBody.code === 0, JSON.stringify(edgeEntryBody))
  ok('首次请求经适配器完成默认分类种子', Number(edgeEntryBody.data?.templateVersion) >= 2, JSON.stringify(edgeEntryBody.data))
  const edgeUnauth = await edgeOnRequest({
    request: new Request('https://example.com/api/meta'),
    env: { KV: new FakeEdgeBinding(), AUTH_TOKEN: 'secret' }
  })
  ok('缺少令牌返回 401', edgeUnauth.status === 401)
  // EdgeOne 官方示例把 KV 绑定当全局变量用，这里验证全局注入路径
  globalThis.KV = new FakeEdgeBinding()
  const edgeGlobal = await edgeOnRequest({
    request: new Request('https://example.com/api/meta', { headers: { 'X-Auth-Token': 'secret' } }),
    env: { AUTH_TOKEN: 'secret' }
  })
  ok('全局 KV 绑定可用', edgeGlobal.status === 200)
  delete globalThis.KV
  const edgeNoKV = await edgeOnRequest({
    request: new Request('https://example.com/api/meta', { headers: { 'X-Auth-Token': 'secret' } }),
    env: { AUTH_TOKEN: 'secret' }
  })
  const edgeNoKVBody = await edgeNoKV.json()
  ok('缺少 KV 绑定时明确报错', edgeNoKV.status === 500 && String(edgeNoKVBody.msg).includes('KV'))

  console.log('\n[24] Cloudflare Pages 入口')
  // 模拟 Cloudflare KV：list 返回 { keys: [{ name }], list_complete, cursor }
  class FakeCFBinding {
    constructor() { this.map = new Map() }
    async get(key) { return this.map.get(key) ?? null }
    async put(key, value) { this.map.set(key, value) }
    async delete(key) { this.map.delete(key) }
    async list({ prefix = '', limit = 1000, cursor } = {}) {
      const all = [...this.map.keys()].filter((k) => k.startsWith(prefix)).sort()
      const start = cursor ? all.indexOf(cursor) : 0
      const page = all.slice(start, start + Math.min(limit, 1000))
      const end = start + page.length
      return {
        keys: page.map((name) => ({ name })),
        list_complete: end >= all.length,
        cursor: end < all.length ? all[end] : undefined
      }
    }
  }
  const { onRequest: cfOnRequest } = await import('../../functions/api/[[path]].js')
  const cfEnv = { KV: new FakeCFBinding(), AUTH_TOKEN: 'secret' }
  const cfMeta = await cfOnRequest({
    request: new Request('https://example.pages.dev/api/meta', { headers: { 'X-Auth-Token': 'secret' } }),
    env: cfEnv
  })
  const cfMetaBody = await cfMeta.json()
  ok('Cloudflare 入口复用统一路由', cfMeta.status === 200 && cfMetaBody.code === 0, JSON.stringify(cfMetaBody))
  ok('Cloudflare 首次请求完成种子', Number(cfMetaBody.data?.templateVersion) >= 2)
  const cfCreated = await cfOnRequest({
    request: new Request('https://example.pages.dev/api/parts', {
      method: 'POST',
      headers: { 'X-Auth-Token': 'secret', 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'CF 测试电阻', package: '0603' })
    }),
    env: cfEnv
  })
  const cfCreatedBody = await cfCreated.json()
  ok('Cloudflare 可写器件', cfCreated.status === 200 && cfCreatedBody.code === 0, JSON.stringify(cfCreatedBody))
  const cfList = await cfOnRequest({
    request: new Request('https://example.pages.dev/api/parts?pageSize=5', { headers: { 'X-Auth-Token': 'secret' } }),
    env: cfEnv
  })
  const cfListBody = await cfList.json()
  ok('Cloudflare 可读回写入的数据', cfListBody.data?.total === 1, JSON.stringify(cfListBody.data?.total))
  const cfUnauth = await cfOnRequest({
    request: new Request('https://example.pages.dev/api/meta'),
    env: cfEnv
  })
  ok('Cloudflare 缺少令牌返回 401', cfUnauth.status === 401)
  const cfNoKV = await cfOnRequest({
    request: new Request('https://example.pages.dev/api/meta', { headers: { 'X-Auth-Token': 'secret' } }),
    env: { AUTH_TOKEN: 'secret' }
  })
  ok('Cloudflare 缺少 KV 返回明确报错', cfNoKV.status === 500)

  console.log('\n[25] 离线版能力边界')
  const { handleApi } = await import('../../server/http/router.js')
  // 非 C 料号不会触发公网查询，用于验证路由在离线环境下不再被 501 拦截
  const infoUrl = 'https://local/api/parts/info/lcsc/STM32F103C8T6'
  const offlineInfo = await handleApi(
    new Request(infoUrl),
    { LOCAL_KV: new MemoryKV(), AUTH_DISABLED: '1', OFFLINE: '1' },
    new URL(infoUrl)
  )
  const offlineInfoBody = await offlineInfo.json()
  ok('离线版第三方查询不再返回 501', offlineInfo.status === 200 && offlineInfoBody.code === 0, JSON.stringify(offlineInfoBody))
  ok('离线版非 C 料号给出公开库指引', String(offlineInfoBody.data?.message || '').includes('C 开头'), JSON.stringify(offlineInfoBody))
  const onlineInfo = await handleApi(
    new Request(infoUrl),
    { LOCAL_KV: new MemoryKV(), AUTH_DISABLED: '1' },
    new URL(infoUrl)
  )
  ok('联网版行为一致', onlineInfo.status === 200)

  console.log('\n[26] 嘉立创开放平台接入')
  const { buildStringToSign, signString } = await import('../../server/infrastructure/jlc/client.js')
  const { queryComponent, normalizeComponent, normalizeEasyEda } = await import('../../server/application/component-info.service.js')
  const officialText = buildStringToSign({
    method: 'POST',
    path: '/order/v1/createOrder',
    timestamp: 1625208260,
    nonce: 'IZHEJYNIHYZIE8S0LLC0VWTPJVRRTO50',
    body: '{"goodsId":100,"quantity":52,"createdTime":"2024-03-21 10:03:20"}'
  })
  const officialSign = await signString('z0BWlikshimuyiwBsH1i2qwnzMb3j3kA', officialText)
  ok('签名串格式与官方一致', officialText.startsWith('POST\n/order/v1/createOrder\n1625208260\nIZHEJYNIHYZIE8S0LLC0VWTPJVRRTO50\n'))
  ok('HmacSHA256 签名值匹配官方示例',
    officialSign === 'sygwKhKBkLwHVv0c7D+a/A7JTEJjGH/kLugFKh16918=', officialSign)

  const unconfigured = await queryComponent({}, 'ABC-123')
  ok('非 C 料号且未配置密钥时给出指引', unconfigured.configured === false && unconfigured.message.includes('C 开头'))
  const noPath = await queryComponent(
    { JLC_APP_ID: 'a', JLC_ACCESS_KEY: 'b', JLC_SECRET_KEY: 'c' },
    'C12345',
    { fetchImpl: async () => new Response('', { status: 404 }) }
  )
  ok('已配置密钥但缺少接口路径时提示', noPath.configured === true && noPath.message.includes('JLC_COMPONENT_PATH'))

  const fakeFetch = async () => new Response(JSON.stringify({
    code: 0,
    data: { list: [{ productCode: 'C12345', productName: '贴片电阻 10kΩ', brandName: 'YAGEO', package: '0603', stockNumber: 1200, price: 0.012, datasheetUrl: 'https://example.com/a.pdf' }] }
  }), { status: 200, headers: { 'J-Trace-ID': 'trace-1' } })
  const queried = await queryComponent(
    { JLC_APP_ID: 'a', JLC_ACCESS_KEY: 'b', JLC_SECRET_KEY: 'c', JLC_COMPONENT_PATH: '/component/v1/detail' },
    'C12345',
    { fetchImpl: fakeFetch, now: () => 1625208260000, nonce: 'N'.repeat(32) }
  )
  ok('查询成功并归一化字段',
    queried.ok === true && queried.item.name === '贴片电阻 10kΩ' && queried.item.package === '0603' && queried.item.stock === 1200,
    JSON.stringify(queried.item))
  ok('返回 traceId 便于排查', queried.traceId === 'trace-1')
  const normalized = normalizeComponent({ componentCode: 'C9', goodsName: '电容 100nF', brand: 'Samsung', encapsulation: '0603', inventory: 50, salePrice: 0.02 })
  ok('归一化兼容不同字段别名', normalized.sku === 'C9' && normalized.brand === 'Samsung' && normalized.package === '0603')

  console.log('\n[27] 嘉立创公开器件库（免密钥回退）')
  const fakeEasyEda = async () => new Response(JSON.stringify({
    success: true,
    code: 0,
    result: {
      title: '0603WAF1002T5E',
      description: '10KΩ (1002) ±1%',
      dataStr: {
        head: {
          c_para: {
            name: '0603WAF1002T5E',
            package: 'R0603',
            Manufacturer: 'UNI-ROYAL(厚声)',
            'Manufacturer Part': '0603WAF1002T5E',
            'Supplier Part': 'C25804',
            Value: '10kΩ'
          }
        }
      },
      lcsc: { number: 'C25804', price: 0.0017, stock: 8999650, url: 'https://lcsc.com/product-detail/C25804.html' }
    }
  }), { status: 200 })
  const easyItem = normalizeEasyEda(JSON.parse(await (await fakeEasyEda()).text()).result, 'C25804')
  ok('公开库归一化：封装 R0603 → 0603', easyItem.package === '0603', easyItem.package)
  ok('公开库归一化：品牌与型号', easyItem.brand.includes('UNI-ROYAL') && easyItem.model === '0603WAF1002T5E')
  ok('公开库归一化：库存与价格', easyItem.stock === 8999650 && easyItem.price === 0.0017)
  ok('公开库归一化：名称含规格值', easyItem.name.includes('10kΩ'), easyItem.name)

  const easyQuery = await queryComponent({}, 'C25804', { fetchImpl: fakeEasyEda })
  ok('未配置密钥也能按 C 料号查询', easyQuery.ok === true && easyQuery.source === 'easyeda', JSON.stringify(easyQuery).slice(0, 120))
  const easyMissing = await queryComponent({}, 'C999999', { fetchImpl: async () => new Response('', { status: 404 }) })
  ok('公开库查不到时给出明确提示', easyMissing.ok === false && easyMissing.message.includes('C999999'))
  const easyInvalid = await queryComponent({}, 'STM32F103C8T6', { fetchImpl: fakeEasyEda })
  ok('非 C 料号不会误查公开库', easyInvalid.ok === false && easyInvalid.message.includes('C 开头'))
  const offlineEasy = await queryComponent({ OFFLINE: '1' }, 'C25804', { fetchImpl: fakeEasyEda })
  ok('离线版环境同样可查公开库', offlineEasy.ok === true && offlineEasy.source === 'easyeda')

  console.log(`\n========== 结果: ${passed} 通过, ${failed} 失败 ==========`)
  // 用 exitCode 而非 process.exit：避免 Windows 下 fetch/undici 句柄未释放触发 libuv 断言
  process.exitCode = failed === 0 ? 0 : 1
}

main().catch((e) => { console.error('测试异常:', e); process.exitCode = 1 })
