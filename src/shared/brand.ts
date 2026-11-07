// src/shared/brand.ts
// 品牌文案唯一来源：侧栏、登录页、关于页、页面标题都从这里取值。
// 改名只需改本文件，避免同一名称散落在多个视图里产生不一致。

export const BRAND = {
  /** 中文主名，用于侧栏与登录页标题 */
  name: '樂創元件库',
  /** 面包屑等窄空间使用的短名 */
  shortName: '樂創',
  /** 英文副标，分写 + 大字距，保持克制 */
  english: 'LEECO PARTS HUB',
  /** 产品标识，用于文档、部署说明与技术上下文 */
  product: 'Leeco PartsHub',
  /** 一句话定位 */
  tagline: '元器件库存管理系统'
} as const

/** 浏览器标题与分享卡片标题 */
export const BRAND_TITLE = `${BRAND.name} · ${BRAND.product}`
