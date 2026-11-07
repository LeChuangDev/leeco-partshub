# API 参考

- 基础路径：`/api`
- 鉴权：除 `/api/auth/*` 外，所有请求需携带 `X-Auth-Token`，与部署环境变量 `AUTH_TOKEN` 一致
- 响应信封：`{ "code": 0, "data": ..., "msg": "success" }`
- 错误码：`400` 参数或业务校验失败、`401` 未授权、`404` 资源不存在、`405` 方法不允许、`500` 未捕获异常
- 缓存：所有接口返回 `cache-control: no-store`

## 鉴权

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/auth/check` | 校验令牌，返回 `{ authenticated, devBypass? }` |

## 分类

| 方法 | 路径 | 参数 |
| --- | --- | --- |
| GET | `/api/categories` | 可选 `?id=` 查单条 |
| POST | `/api/categories` | `{ name, parentId?, order?, paramTemplate? }` |
| PUT | `/api/categories` | `{ id, name?, parentId?, order?, paramTemplate? }` |
| DELETE | `/api/categories?id=` | 分类下有器件时拒绝删除 |

## 元器件

| 方法 | 路径 | 参数 |
| --- | --- | --- |
| GET | `/api/parts` | `categoryId / tag / search / expr / page / pageSize / sort / withQuantity=0` |
| GET | `/api/parts?id=` | 返回器件详情、批次与 `totalQuantity` |
| POST | `/api/parts` | `{ name, package?, categoryId?, params?, suppliers?, safetyStock? ... }` |
| PUT | `/api/parts` | `{ id, ...patch }`，封装与参数自动归一化 |
| DELETE | `/api/parts?id=` | 级联删除该器件库存批次 |
| GET | `/api/parts/info/:platform/:sku` | 第三方器件信息（占位实现） |

检索说明：`search` 与 `expr` 会合并为一次 token 归一化匹配，`1000nF` 命中 `1µF`、`103` 命中 `10kΩ`。

## 库存与流水

| 方法 | 路径 | 参数 |
| --- | --- | --- |
| GET | `/api/stock?partId=` | 按入库时间升序返回批次 |
| POST | `/api/stock/in` | `{ partId, quantity, unitPrice?, locationId?, supplier?, orderNo?, note? }` |
| POST | `/api/stock/out` | `{ partId, quantity, stockId?, reason?, projectId?, projectName? }` |
| POST | `/api/stock/move` | `{ partId, locationId, stockId? }`，只改批次归属、不写流水 |
| GET | `/api/transactions?partId=&limit=` | 不传 `partId` 返回全局流水 |

出库按 FIFO 跨批次扣减；指定 `stockId` 时优先扣该批次。数量必须为正整数，超量出库返回 `400`。

## 存储位置

| 方法 | 路径 | 参数 |
| --- | --- | --- |
| GET | `/api/locations` | 可选 `?id=` |
| POST | `/api/locations` | `{ name, code?, parentId?, grid? }` |
| PUT | `/api/locations` | `{ id, name?, code?, parentId?, grid? }` |
| DELETE | `/api/locations?id=` | 子位置上移，不删除库存批次 |

## BOM 齐套

| 方法 | 路径 | 参数 |
| --- | --- | --- |
| POST | `/api/bom/match` | `{ rows: [...] }`，单次最多 2000 行 |
| POST | `/api/bom/consume` | `{ lines | items, projectName?, operator? }` |
| POST | `/api/bom/parse` | `{ text }`，解析粘贴文本为行 |
| GET | `/api/bom/template` | 返回导入模板列与示例 |

匹配优先级：供应商料号 → 原厂型号 + 封装 → 名称/参数相似度；未匹配行返回最多 3 个候选。

## 项目 BOM

| 方法 | 路径 | 参数 |
| --- | --- | --- |
| GET | `/api/projects` | 项目列表 |
| POST | `/api/projects` | `{ name, buildQty?, status?, lines? }` |
| GET | `/api/projects/:id` | 可选 `?buildQty=`，返回项目、BOM 行、齐套汇总 |
| PUT | `/api/projects/:id` | `{ name?, code?, version?, status?, owner?, note?, buildQty? }` |
| DELETE | `/api/projects/:id` | 删除项目与 BOM 文档 |
| PUT | `/api/projects/:id/bom` | `{ lines, buildQty? }`，覆盖保存并返回分析 |
| POST | `/api/projects/:id/import` | `{ text? | rows?, mode: 'replace' | 'append', buildQty? }` |
| GET | `/api/projects/:id/analyze` | 仅重新分析 |
| POST | `/api/projects/:id/consume` | `{ buildQty? }`，按项目领料并写流水 |

需求数量 = 单套用量 × 投产套数；领料按 FIFO，失败行整体不出并在 `failed` 中返回原因。

## 导入

| 方法 | 路径 | 参数 |
| --- | --- | --- |
| POST | `/api/import/batch` | `{ rows }` 返回去重计划；`{ items }` 直接提交 |

## 搜索与统计

| 方法 | 路径 | 参数 |
| --- | --- | --- |
| GET | `/api/search?q=&limit=` | 一次返回 `{ parts, locations, categories, total }` |
| GET | `/api/stats?period=week|month|year` | 库存总量/货值、预警、缺货、呆滞、趋势与分布 |
| GET | `/api/meta` | 版本与最后更新时间 |

## 备份

| 方法 | 路径 | 参数 |
| --- | --- | --- |
| GET | `/api/export/all` | 导出分类、器件、批次、位置、流水、项目与项目 BOM |
| POST | `/api/export/restore` | 备份对象，**覆盖**现有数据并重建索引 |
