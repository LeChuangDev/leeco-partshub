// shared/__tests__/run.mjs
// 后端逻辑单元测试：用 MemoryKV 真实调用 store / import，覆盖核心业务与边界。
// 运行：node shared/__tests__/run.mjs
import { MemoryKV } from '../kv.js'
import { seedIfEmpty } from '../seed.js'
import { DEFAULT_CATEGORIES } from '../models.js'
import * as store from '../store.js'
import { planImport, commitImport } from '../import.js'
import { parseBomText, matchBom, consumeBom } from '../bom.js'
import {
  createProject, updateProject, deleteProject, getProjectDoc,
  saveProjectLines, importProjectBom, analyzeProject, consumeProject
} from '../project.js'
import { buildPartQrText, buildLocationQrText, isPublicOrigin } from '../qr.js'
import { parseScanPayload } from '../scan.js'
import { mapRow, detectPlatform } from '../import-map.js'
import { normalizePackage, parseSI, formatSI, eiaCode } from '../normalize.js'

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
  const cats = await store.listCategories(kv)
  ok('默认顶级分类数量为 9', cats.filter((c) => !c.parentId).length === 9, `实际 ${cats.filter((c) => !c.parentId).length}`)
  ok('默认分类总节点数与模板一致', cats.length === TOTAL_CATS, `实际 ${cats.length}, 期望 ${TOTAL_CATS}`)
  const resistor = cats.find((c) => c.name === '电阻')
  ok('存在「电阻」分类且带参数模板', resistor && resistor.paramTemplate.length > 0)

  console.log('\n[2] 创建元器件 + 索引')
  const p1 = await store.createPart(kv, {
    name: '0805 10kΩ 电阻', categoryId: resistor.id, package: '0805',
    manufacturerModel: 'RC0805', params: { resistance: '10k', tolerance: '1%' },
    tags: ['常用'], suppliers: [{ platform: 'lcsc', sku: 'C123', price: 0.01 }]
  })
  ok('创建元器件返回 id', !!p1.id)
  const byTag = await store.listParts(kv, { tag: '常用' })
  ok('按标签索引可检索到', byTag.list.length === 1)
  const byCat = await store.listParts(kv, { categoryId: resistor.id })
  ok('按分类索引可检索到', byCat.list.length === 1)

  console.log('\n[3] 全文与表达式检索')
  const s1 = await store.listParts(kv, { search: 'C123' })
  ok('全文检索 供应商料号命中', s1.list.length === 1)
  const e1 = await store.listParts(kv, { expr: '10k 0805 1%' })
  ok('表达式 10k 0805 1% 命中', e1.list.length === 1)
  const e2 = await store.listParts(kv, { expr: '10k 1206' })
  ok('表达式 10k 1206 不命中', e2.list.length === 0)

  console.log('\n[3.1] 字段归一化与单位换算检索')
  ok('封装 1608 Metric → 0603', normalizePackage('1608 Metric') === '0603')
  ok('封装 0402 (1005 Metric) → 0402', normalizePackage('0402 (1005 Metric)') === '0402')
  ok('SOT23 → SOT-23', normalizePackage('SOT23') === 'SOT-23')
  ok('1000nF 解析为 1µF', formatSI(parseSI('1000nF').value, 'capacitance') === '1µF')
  ok('10kΩ 的 EIA 代码为 103', eiaCode(10000, 'resistance') === '103')
  ok('创建时参数 10k 归一为 10kΩ', p1.params.resistance === '10kΩ', `实际 ${p1.params.resistance}`)

  const capCat = cats.find((c) => c.name === '电容')
  const p2 = await store.createPart(kv, {
    name: '1µF 陶瓷电容', categoryId: capCat.id, package: '1608 Metric',
    params: { capacitance: '1000nF' }
  })
  ok('创建时 1000nF 归一为 1µF', p2.params.capacitance === '1µF', `实际 ${p2.params.capacitance}`)
  ok('创建时 1608 Metric 归一为 0603', p2.package === '0603', `实际 ${p2.package}`)
  const sCap = await store.listParts(kv, { search: '1000nF' })
  ok('搜索 1000nF 命中 1µF 电容', sCap.list.some((p) => p.id === p2.id))
  const sEia = await store.listParts(kv, { search: '1002' })
  ok('搜索 1002 命中 10kΩ 电阻', sEia.list.some((p) => p.id === p1.id))
  const sPkg = await store.listParts(kv, { search: '1608 Metric' })
  ok('搜索 1608 Metric 命中 0603 封装', sPkg.list.some((p) => p.id === p2.id))
  const sCatName = await store.listParts(kv, { search: '电容' })
  ok('可按分类名检索', sCatName.list.some((p) => p.id === p2.id))
  const sMiss = await store.listParts(kv, { search: '470nF' })
  ok('不相关容值不误命中', !sMiss.list.some((p) => p.id === p2.id))

  console.log('\n[4] 库存入库 / 出库 / 流水')
  await store.stockIn(kv, p1.id, { quantity: 100, unitPrice: 0.01, supplier: 'lcsc' })
  let total = await store.partTotalQuantity(kv, p1.id)
  ok('入库后总量 100', total === 100, `实际 ${total}`)
  const out = await store.stockOut(kv, p1.id, { quantity: 30, reason: '领料' })
  ok('出库成功', out.ok === true)
  total = await store.partTotalQuantity(kv, p1.id)
  ok('出库后总量 70', total === 70, `实际 ${total}`)
  const txns = await store.listTransactions(kv, p1.id)
  ok('生成 2 条流水（1入1出）', txns.length === 2)
  const overOut = await store.stockOut(kv, p1.id, { quantity: 999 })
  ok('超额出库被拒绝', overOut.ok === false)
  const zeroIn = await store.stockIn(kv, p1.id, { quantity: 0 })
  ok('入库数量 0 被拒绝', zeroIn.ok === false)
  const negIn = await store.stockIn(kv, p1.id, { quantity: -5 })
  ok('入库负数被拒绝', negIn.ok === false)
  total = await store.partTotalQuantity(kv, p1.id)
  ok('非法入库未产生批次', total === 70, `实际 ${total}`)
  // 列表需带库存合计与批次（列表页库存列依赖）
  const listed = await store.listParts(kv, { pageSize: 10 })
  const row1 = listed.list.find((p) => p.id === p1.id)
  ok('列表返回库存合计 70', row1 && row1.totalQuantity === 70, `实际 ${row1 && row1.totalQuantity}`)
  ok('列表返回批次数组', row1 && Array.isArray(row1.stocks) && row1.stocks.length === 1)
  const listedLite = await store.listParts(kv, { pageSize: 10, withQuantity: false })
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
  total = await store.partTotalQuantity(kv, p1.id)
  ok('匹配入库后 p1 总量 120', total === 120, `实际 ${total}`)
  const newPart = await store.listParts(kv, { search: 'C999' })
  ok('新建元器件已落库', newPart.list.length === 1)

  console.log('\n[6] 统计看板')
  const stats = await store.getStats(kv)
  ok('统计包含分类/元器件计数', stats.categoriesCount === TOTAL_CATS && stats.partsCount >= 2)
  ok('库存总价值 > 0', stats.totalValue > 0, `实际 ${stats.totalValue}`)

  console.log('\n[7] 删除元器件与索引清理')
  const del = await store.deletePart(kv, p1.id)
  ok('删除成功', del.ok === true)
  const after = await store.listParts(kv, { tag: '常用' })
  ok('删除后标签索引已清理', after.list.length === 0)

  console.log('\n[8] 导出 / 导入 备份')
  const exp = await store.exportAll(kv)
  ok('导出包含各部分', exp.categories.length === TOTAL_CATS && exp.parts.length >= 1)
  const kv2 = new MemoryKV()
  await store.importAll(kv2, exp)
  const exp2 = await store.exportAll(kv2)
  ok('导入备份后数据一致', exp2.parts.length === exp.parts.length && exp2.categories.length === TOTAL_CATS)

  console.log('\n[9] 三级去重：参数 + 封装疑似重复')
  const kv3 = new MemoryKV()
  await seedIfEmpty(kv3)
  const rcat3 = (await store.listCategories(kv3)).find((c) => c.name === '电阻')
  const exist = await store.createPart(kv3, {
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
  const qty3 = await store.partTotalQuantity(kv3, exist.id)
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
  const created4 = await store.getPart(kv3, c4.created[0])
  const stock4 = (await store.listStock(kv3, created4.id))[0]
  ok('导入批次来源记录为「立创」', stock4.supplier === '立创', `实际 ${stock4.supplier}`)
  ok('导入批次保留订单号与单价', stock4.orderNo === 'RAW-001' && stock4.unitPrice === 0.01)

  console.log('\n[11] BOM 齐套：解析 / 匹配 / 出库')
  const kv5 = new MemoryKV()
  await seedIfEmpty(kv5)
  const cats5 = await store.listCategories(kv5)
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

  const pR = await store.createPart(kv5, {
    name: '0603 10kΩ 电阻', categoryId: resCat5.id, package: '0603',
    manufacturerModel: 'RC0805FR-0710KL', safetyStock: 50, params: { resistance: '10kΩ', tolerance: '±1%' }
  })
  await store.stockIn(kv5, pR.id, { quantity: 5, unitPrice: 0.01, supplier: '立创', locationId: null })
  const pU = await store.createPart(kv5, {
    name: 'STM32F103C8T6', categoryId: mcuCat5 ? mcuCat5.id : null, package: 'LQFP-48',
    manufacturerModel: 'STM32F103C8T6'
  })
  await store.stockIn(kv5, pU.id, { quantity: 3, unitPrice: 6.5 })

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
  await store.stockIn(kv5, pR.id, { quantity: 5 })
  const consume = await consumeBom(kv5, [lineR1, lines.find((l) => l.designators === 'R9')], { projectName: '测试板 V1' })
  ok('多行同器件合并出库成功', consume.ok === true && consume.totalOut === 5, JSON.stringify(consume.failed))
  const qtyAfter = await store.partTotalQuantity(kv5, pR.id)
  ok('出库后库存扣减到 5', qtyAfter === 5, `实际 ${qtyAfter}`)
  const txns5 = await store.listTransactions(kv5, pR.id, 10)
  ok('流水记录项目名', txns5.some((t) => t.reason.includes('测试板 V1')))

  console.log('\n[8] 项目 BOM')
  const kv6 = new MemoryKV()
  await seedIfEmpty(kv6)
  const cats6 = await store.listCategories(kv6)
  const resCat6 = cats6.find((c) => c.name === '电阻')
  const pR6 = await store.createPart(kv6, {
    name: '0603 10kΩ 电阻', categoryId: resCat6.id, package: '0603',
    manufacturerModel: 'RC0805FR-0710KL', params: { resistance: '10kΩ', tolerance: '±1%' }
  })
  await store.stockIn(kv6, pR6.id, { quantity: 100, unitPrice: 0.01 })
  const pU6 = await store.createPart(kv6, {
    name: 'STM32F103C8T6', categoryId: null, package: 'LQFP-48',
    manufacturerModel: 'STM32F103C8T6', params: { voltage: '3.3V' }
  })
  await store.stockIn(kv6, pU6.id, { quantity: 2, unitPrice: 6.5 })

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
  const txns6 = await store.listTransactions(kv6, pR6.id, 10)
  ok('流水写入项目归属', txns6.some((t) => t.projectId === created6.project.id && t.projectName === '温控板'))
  const qtyR6 = await store.partTotalQuantity(kv6, pR6.id)
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

  console.log('\n[11] 移动库存位置')
  const locMoveA = await store.createLocation(kv, { name: '测试柜 A', code: 'T-A' })
  const locMoveB = await store.createLocation(kv, { name: '测试柜 B', code: 'T-B' })
  const pMove = await store.createPart(kv, { name: '移动测试电阻', package: '0603' })
  const inMove = await store.stockIn(kv, pMove.id, { quantity: 50, locationId: locMoveA.id, unitPrice: 0.01 })
  ok('入库批次带位置', inMove.ok && inMove.stock.locationId === locMoveA.id)
  const mv1 = await store.moveStock(kv, { partId: pMove.id, locationId: locMoveB.id })
  ok('整颗料移动到新位置', mv1.ok && mv1.moved === 1, JSON.stringify(mv1))
  const stockAfterMove = await store.listStock(kv, pMove.id)
  ok('批次位置已更新', stockAfterMove[0].locationId === locMoveB.id)
  const mv2 = await store.moveStock(kv, { partId: pMove.id, locationId: locMoveB.id })
  ok('位置未变化时幂等返回', mv2.ok && mv2.unchanged === true && mv2.moved === 0, JSON.stringify(mv2))
  const mvBad = await store.moveStock(kv, { partId: pMove.id, locationId: 'not-exist' })
  ok('目标位置不存在被拒绝', mvBad.ok === false)
  const mvNoPart = await store.moveStock(kv, { partId: 'not-exist', locationId: locMoveB.id })
  ok('元器件不存在被拒绝', mvNoPart.ok === false)
  const qtyAfterMove = await store.partTotalQuantity(kv, pMove.id)
  ok('移动不改变库存数量', qtyAfterMove === 50, `实际 ${qtyAfterMove}`)

  console.log(`\n========== 结果: ${passed} 通过, ${failed} 失败 ==========`)
  process.exit(failed === 0 ? 0 : 1)
}

main().catch((e) => { console.error('测试异常:', e); process.exit(1) })
