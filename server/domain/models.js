// server/domain/models.js
// 数据模型定义：JSON 结构、ID 生成、默认分类模板（含参数模板）。

export function uid(prefix) {
  const t = Date.now().toString(36)
  const r = Math.random().toString(36).slice(2, 8)
  return `${prefix}_${t}${r}`
}

export function nowISO() {
  return new Date().toISOString()
}

// 默认分类模板：内置 9 大类，每类绑定独立参数模板。
// paramTemplate 项：{ key, label, type:'text'|'number'|'enum', unit?, options?[] }
export const DEFAULT_CATEGORIES = [
  {
    name: '电阻',
    paramTemplate: [
      { key: 'resistance', label: '阻值', type: 'text', unit: 'Ω' },
      { key: 'power', label: '功率', type: 'text', unit: 'W' },
      { key: 'tolerance', label: '精度', type: 'enum', options: ['±0.1%', '±0.5%', '±1%', '±5%'] }
    ]
  },
  {
    name: '电容',
    paramTemplate: [
      { key: 'capacitance', label: '容值', type: 'text', unit: 'F' },
      { key: 'voltage', label: '耐压', type: 'text', unit: 'V' },
      { key: 'material', label: '材质', type: 'enum', options: ['陶瓷', '电解', '钽', '薄膜'] }
    ]
  },
  {
    name: '电感',
    paramTemplate: [
      { key: 'inductance', label: '感值', type: 'text', unit: 'H' },
      { key: 'current', label: '额定电流', type: 'text', unit: 'A' },
      { key: 'tolerance', label: '精度', type: 'text' }
    ]
  },
  {
    name: '二极管/三极管',
    paramTemplate: [
      { key: 'type', label: '类型', type: 'enum', options: ['二极管', '三极管', 'MOSFET', '稳压管', '肖特基'] },
      { key: 'voltage', label: '耐压', type: 'text', unit: 'V' },
      { key: 'current', label: '电流', type: 'text', unit: 'A' }
    ],
    children: [
      {
        name: 'TVS/ESD 保护',
        paramTemplate: [
          { key: 'breakdownV', label: '击穿电压', type: 'text', unit: 'V' },
          { key: 'clampV', label: '钳位电压', type: 'text', unit: 'V' },
          { key: 'peakPower', label: '峰值功率', type: 'text', unit: 'W' },
          { key: 'package', label: '封装', type: 'text' }
        ]
      },
      {
        name: '整流/肖特基',
        paramTemplate: [
          { key: 'reverseV', label: '反向电压', type: 'text', unit: 'V' },
          { key: 'forwardCurrent', label: '正向电流', type: 'text', unit: 'A' },
          { key: 'package', label: '封装', type: 'text' }
        ]
      },
      {
        name: 'MOSFET',
        paramTemplate: [
          { key: 'channel', label: '沟道', type: 'enum', options: ['N', 'P'] },
          { key: 'vds', label: '耐压 Vds', type: 'text', unit: 'V' },
          { key: 'current', label: '电流 Id', type: 'text', unit: 'A' },
          { key: 'rdson', label: '导通电阻', type: 'text', unit: 'Ω' },
          { key: 'package', label: '封装', type: 'text' }
        ]
      },
      {
        name: '三极管',
        paramTemplate: [
          { key: 'polarity', label: '极性', type: 'enum', options: ['NPN', 'PNP'] },
          { key: 'voltage', label: '耐压', type: 'text', unit: 'V' },
          { key: 'current', label: '电流', type: 'text', unit: 'A' },
          { key: 'package', label: '封装', type: 'text' }
        ]
      }
    ]
  },
  {
    name: '芯片/MCU',
    paramTemplate: [
      { key: 'model', label: '型号', type: 'text' },
      { key: 'voltage', label: '工作电压', type: 'text', unit: 'V' },
      { key: 'interface', label: '接口', type: 'text' }
    ],
    children: [
      {
        name: 'LDO 线性稳压',
        paramTemplate: [
          { key: 'vin', label: '输入电压', type: 'text', unit: 'V' },
          { key: 'vout', label: '输出电压', type: 'text', unit: 'V' },
          { key: 'iout', label: '输出电流', type: 'text', unit: 'A' },
          { key: 'dropout', label: '压差', type: 'text', unit: 'V' },
          { key: 'package', label: '封装', type: 'text' }
        ]
      },
      {
        name: 'DC-DC 电源芯片',
        paramTemplate: [
          { key: 'vin', label: '输入电压', type: 'text', unit: 'V' },
          { key: 'vout', label: '输出电压', type: 'text', unit: 'V' },
          { key: 'iout', label: '输出电流', type: 'text', unit: 'A' },
          { key: 'topology', label: '拓扑', type: 'enum', options: ['降压 BUCK', '升压 BOOST', '升降压', '反激'] },
          { key: 'freq', label: '开关频率', type: 'text', unit: 'Hz' },
          { key: 'package', label: '封装', type: 'text' }
        ]
      },
      {
        name: 'MCU/单片机',
        paramTemplate: [
          { key: 'core', label: '内核', type: 'text' },
          { key: 'freq', label: '主频', type: 'text', unit: 'Hz' },
          { key: 'flash', label: 'Flash', type: 'text' },
          { key: 'ram', label: 'RAM', type: 'text' },
          { key: 'package', label: '封装', type: 'text' }
        ]
      },
      {
        name: '运算放大器',
        paramTemplate: [
          { key: 'kind', label: '类型', type: 'enum', options: ['运放', '比较器'] },
          { key: 'vsup', label: '供电电压', type: 'text', unit: 'V' },
          { key: 'gbw', label: '带宽', type: 'text', unit: 'Hz' },
          { key: 'slew', label: '压摆率', type: 'text', unit: 'V/μs' },
          { key: 'package', label: '封装', type: 'text' }
        ]
      },
      {
        name: '逻辑/接口芯片',
        paramTemplate: [
          { key: 'kind', label: '类型', type: 'text' },
          { key: 'vcc', label: '电压', type: 'text', unit: 'V' },
          { key: 'package', label: '封装', type: 'text' }
        ]
      },
      {
        name: '存储芯片',
        paramTemplate: [
          { key: 'kind', label: '类型', type: 'enum', options: ['EEPROM', 'Flash', 'SDRAM'] },
          { key: 'capacity', label: '容量', type: 'text' },
          { key: 'interface', label: '接口', type: 'text' },
          { key: 'package', label: '封装', type: 'text' }
        ]
      },
      {
        name: '时钟与晶振',
        paramTemplate: [
          { key: 'freq', label: '频率', type: 'text', unit: 'Hz' },
          { key: 'accuracy', label: '精度', type: 'text' },
          { key: 'package', label: '封装', type: 'text' }
        ]
      }
    ]
  },
  {
    name: '连接器',
    paramTemplate: [
      { key: 'pins', label: '针数', type: 'number' },
      { key: 'pitch', label: '间距', type: 'text', unit: 'mm' },
      { key: 'type', label: '类型', type: 'text' }
    ]
  },
  {
    name: '无源器件',
    paramTemplate: [{ key: 'spec', label: '规格', type: 'text' }]
  },
  {
    name: '结构件',
    paramTemplate: [
      { key: 'material', label: '材质', type: 'text' },
      { key: 'spec', label: '规格', type: 'text' }
    ]
  },
  {
    name: '耗材工具',
    paramTemplate: [{ key: 'spec', label: '规格', type: 'text' }]
  }
]

// 新建记录的默认值构造器
export function newCategory({ name, parentId = null, order = 0, paramTemplate = [] }) {
  return {
    id: uid('cat'),
    name,
    parentId,
    order,
    paramTemplate,
    createdAt: nowISO(),
    updatedAt: nowISO()
  }
}

export function newPart(input = {}) {
  return {
    id: uid('part'),
    internalNo: input.internalNo || '',
    name: input.name || '',
    categoryId: input.categoryId || null,
    package: input.package || '',
    description: input.description || '',
    brand: input.brand || '',
    manufacturerModel: input.manufacturerModel || '',
    alternates: input.alternates || [],
    suppliers: input.suppliers || [], // [{ platform, sku, url, price }]
    params: input.params || {}, // 结构化电气参数
    tags: input.tags || [],
    attachments: input.attachments || [], // [{ id, name, type, data(base64), size }]
    safetyStock: input.safetyStock || 0,
    lastOutAt: null,
    createdAt: nowISO(),
    updatedAt: nowISO()
  }
}

export function newStock(input = {}) {
  return {
    id: uid('stock'),
    partId: input.partId || '',
    locationId: input.locationId || null,
    quantity: input.quantity || 0,
    unit: input.unit || '个',
    unitPrice: input.unitPrice || 0,
    orderNo: input.orderNo || '',
    supplier: input.supplier || '',
    note: input.note || '',
    safetyStock: input.safetyStock || 0,
    createdAt: nowISO(),
    lastOutAt: null
  }
}

export function newLocation({ name, parentId = null, code = '', grid = null }) {
  return {
    id: uid('loc'),
    name,
    parentId,
    code: code || uid('L').slice(0, 6).toUpperCase(),
    grid: grid || null, // { rows, cols }
    createdAt: nowISO(),
    updatedAt: nowISO()
  }
}

export function newTransaction(input = {}) {
  return {
    id: uid('txn'),
    partId: input.partId || '',
    stockId: input.stockId || null,
    type: input.type || 'in', // 'in' | 'out'
    quantity: input.quantity || 0,
    balance: input.balance || 0,
    reason: input.reason || '',
    orderNo: input.orderNo || '',
    note: input.note || '',
    projectId: input.projectId || null,
    projectName: input.projectName || '',
    operator: input.operator || 'system',
    // 审计扩展：来源、导入批次、变动前后数量，便于追溯与按批次撤销
    source: input.source || 'manual',
    batchId: input.batchId || null,
    beforeQty: input.beforeQty == null ? null : Number(input.beforeQty),
    afterQty: input.afterQty == null ? null : Number(input.afterQty),
    createdAt: nowISO()
  }
}

/* ------------------------------- 项目（BOM 归属） ------------------------------- */
// 状态：design 设计 / sample 打样 / pilot 小批 / mass 量产 / archived 归档
export const PROJECT_STATUS = ['design', 'sample', 'pilot', 'mass', 'archived']

export function newProject(input = {}) {
  return {
    id: uid('prj'),
    name: input.name || '未命名项目',
    code: input.code || '',
    version: input.version || 'V1.0',
    status: PROJECT_STATUS.includes(input.status) ? input.status : 'design',
    owner: input.owner || '',
    buildQty: Math.max(1, Number(input.buildQty) || 1), // 本次投产套数
    note: input.note || '',
    lineCount: 0,
    createdAt: nowISO(),
    updatedAt: nowISO()
  }
}

// 项目 BOM 行：quantity 为「单套用量」，需求 = quantity × 项目套数
export function newProjectLine(input = {}) {
  return {
    id: uid('pl'),
    partId: input.partId || null,
    designators: input.designators || '',
    model: input.model || '',
    name: input.name || '',
    package: input.package || '',
    quantity: Math.max(1, Math.ceil(Number(input.quantity) || 1)),
    note: input.note || '',
    createdAt: nowISO()
  }
}
