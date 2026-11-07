# 分析报告 v2 改进对照

分析对象：`Leeco-PartsHub-分析报告-v2.md`。本文记录每一项的落地状态、对应实现与验证证据。
状态定义：**已落地** = 代码与测试均可核对；**部分** = 主路径完成，仍有明确缺口；**未开始** = 保留为后续范围。

## P0：正确性与破坏性防护（阶段一「止血」）

| 编号 | 事项 | 状态 | 实现位置 |
| --- | --- | --- | --- |
| P0-1 | 分类参数 key 中文被清空 | **已落地** | `server/domain/param-template.js` 的 `buildParamTemplate()`（纯函数，下沉出视图）；`PartsView` 调用；单测覆盖中文、中英混排、纯符号、空值、重名与已有 key |
| P0-2 | 备份恢复防护 | **已落地** | `backup.service.js` 的 `validateBackup/countBackup` 与事务式 `importAll`（先算目标状态、快照原值、失败整体回滚）；`POST /export/restore?dryRun=1`；`BackupView` 预演数字 + 输入 `RESTORE` 才能确认 + 会话内回滚 |
| P0-3 | 导入二次确认 / 失败明细 / 撤销 | **已落地** | `ImportView` 确认弹窗与失败行提示；`import.service.js` 生成 `batchId`、记录新建对象，`undoImport()` 只回滚本批次；`GET /import/batches`、`POST /import/undo`；前端 10 分钟倒计时按钮 |
| P0-4 | 缺料行出库语义 | **已落地** | `BomView` 确认弹窗展示「需求 / 本次出库 / 仍未覆盖」；默认只出 `ok` 行，勾选后 `short` 行按可用量部分出库 |
| P0-5 | 统一齐套率 / 匹配率 / 缺料行口径 | **已落地** | `server/domain/bom/summary.js` 唯一实现，后端齐套、项目分析、BOM 页三处共用；UI 标签标注「件 / 行 / 是否含未建档」；`projectsCount` 在 HTTP 层取项目索引真实值；口径写入 `docs/API.md` |
| P0-6 | 审计日志最小版 | **已落地** | `audit.repository.js` + `domain/audit.js` 枚举；出入库/移库/导入/撤销/恢复五类动作留痕，`Transaction` 增 `source/batchId/beforeQty/afterQty`；`GET /api/audit` 与「操作日志」页 |
| P0-7 | 无障碍快修 | **已落地** | 移除 `maximum-scale/user-scalable=no`，补 `description/theme-color/og`，图标按钮补 `aria-label`、装饰图标 `aria-hidden`，`color-scheme`、`prefers-reduced-motion`、Firefox 滚动条 |

## P1 与技术优化

| 编号 | 事项 | 状态 | 说明 |
| --- | --- | --- | --- |
| P1-2 | 扫码入库合并 | **已落地** | `stockIn({ merge:true })` 按「同器件 + 同库位 + 同单价」并入既有批次；扫码入口已启用；单测与契约测试锁定「两次扫码 → 1 批次 / 数量 3」 |
| P1-5 | 标签打印上限与分页 | **已落地** | 选中器件改为按 ID 逐条取详情，不再受 `pageSize:2000` 静默丢件；上限提示与跳过说明；`locPath` 改为 O(1) 索引 Map；二维码并行生成 + `qrcode` 动态 import |
| 6.1 | 重库动态 import | **已落地** | `BomView` / `ImportView` / `BackupView` 三处 `xlsx` 改为 `await import('xlsx')`；`qrcode` 同样按需加载 |
| 3.1-2 | 搜索防抖 | **已落地** | `PartsView.onFilter` 220ms 合并请求 |
| 3.1-5 | 附件体积上限 | **已落地** | 单文件 2MB、单器件累计 6MB，超限提示改用外链或压缩 |
| 2.5-3 / 4 | 布局细节 | **部分** | 快捷键输入态守卫、平台键帽（`Ctrl K` / `⌘K`）、侧栏折叠不覆盖手动选择、`DESC` 死代码删除、`labels` 直达快捷键保留；`copyToken` 与 `revokeObjectURL` 已修复 |
| 2.5-8 | 业务数据 Pinia store | **未开始** | 当前仍以视图本地 ref + `leeco:data-changed` 事件联动为主；统一 store 会牵动全部视图，风险高于收益，留待按模块逐步迁移 |
| 2.5-9 | 大量 `any` | **部分** | 新增端点、审计事件、导入批次均有明确 DTO；既有大视图的历史 `any` 未逐行清理 |
| 3.3-1 | 多 sheet 订单导入 | **未开始** | `ImportView` 仍读第一张表；需先设计 sheet 选择 UI |
| P1-1 | 库存盘点 | **未开始** | 需要盘点单状态机与差异调整流水 |
| P1-3 | 批次 Lot + 保质期 | **未开始** | 当前 `Stock` 已有批次概念，但缺 `lot/expiryDate` 与过期预警 |
| P1-4 | 自定义字段 + 附件铺开 | **部分** | 参数模板已可用且修复中文 key；附件仅本地 Base64 + 体积上限，外链模式与 datasheet 专项未做 |

## P2 / P3（后续范围）

| 编号 | 事项 | 状态 | 原因 |
| --- | --- | --- | --- |
| P2-1 | 缺料自动采购清单 | 未开始 | 依赖供应商料号与价格数据完整性 |
| P2-2 | 供应商价格历史 | 未开始 | 需要新增实体与录入入口 |
| P2-3 | 器件信息抓取 | 未开始 | 第三方接口仍为占位；需先确定可用数据源与合规调用方式 |
| P3-1 | PWA / 移动端 | 未开始 | 需引入 Service Worker 与缓存失效策略 |
| P3-2 | REST API 完整化 + RBAC | 未开始 | 当前为单用户令牌鉴权，团队权限是独立架构演进 |

## 验证证据

- `npm run test:unit`：**156/156**（新增汇总口径 6、参数模板 7、备份校验 5、扫码合并/审计 7、导入撤销 7、恢复回滚 4、品牌标签兼容 3）
- `npm run test:api`：**44/44**（新增统计口径、预演、合并、审计、导入撤销共 14 项）
- `npm run typecheck` / `npm run build`：通过
- Playwright：全路由冒烟、效率工具、项目 BOM、扫码联动、日志页（含暗色与 390px 移动端）控制台 0 错误

## 本次未纳入的取舍

没有引入 ECharts、虚拟滚动、IndexedDB 与 Service Worker：前两项需要真实大数据量与性能基线才能判断是否划算；
后两项会改变缓存一致性模型，应在盘点/批次等数据模型稳定后再做。这些不是遗漏，而是阶段边界。


## 品牌命名（本轮追加）

| 项 | 旧 | 新 | 说明 |
| --- | --- | --- | --- |
| 中文主名 | 樂創元件仓 | **樂創元件库** | 「库」对应 library / inventory，更贴合工程师语境 |
| 英文副标 | LEECO PARTSHUB | **LEECO PARTS HUB** | 分写、拉开字距、降低字重，视觉更透气 |
| 产品标识 | Leeco PartsHub | 不变 | 文档与部署上下文沿用，避免与技术标识脱节 |
| 技术标识 | `leeco-partshub` | 不变 | 包名与 EdgeOne KV 命名空间绑定，改名会破坏部署 |

品牌文案集中在 `src/shared/brand.ts`（前端）与 `server/domain/brand.js`（服务端二维码），
侧栏、登录页、关于页、页面标题、描述与分享卡片已全部同步。

**兼容处理**：新生成的二维码写入新主名；`scan.js` 同时接受新旧标题
（`KNOWN_BRAND_TITLES`），已打印的旧标签仍能识别。单测 `[10b]` 覆盖新码写入与旧码识别，
UI 验收脚本核对侧栏/登录页文字与浏览器标题。登录页顺带移除无效的开发令牌预填并精简提示文案。
