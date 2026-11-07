// server/domain/brand.js
// 服务端品牌文案：二维码文本生成与扫码识别共用同一份，避免「打出来的码扫不出来」。

/** 当前品牌主名，写入新生成的二维码 */
export const BRAND_TITLE = '樂創元件库'

/** 历史名称：已打印的旧标签仍需能被识别，保留为兼容别名 */
export const LEGACY_BRAND_TITLES = ['樂創元件仓']

/** 识别时接受的全部标题 */
export const KNOWN_BRAND_TITLES = [BRAND_TITLE, ...LEGACY_BRAND_TITLES]
