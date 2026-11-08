# 开发与部署

## 环境要求

- Node.js ≥ 18.17（推荐 20 LTS）
- npm ≥ 9
- 本地验证 UI 时需要系统安装 Chrome（Playwright 使用 `channel: 'chrome'`，无需额外下载浏览器）

## 安装与启动

```bash
npm ci

# 同时启动前端与本地 API（推荐）
npm run dev:all

# 或分别启动
npm run dev       # Vite，http://127.0.0.1:5173
npm run dev:api   # 本地 API，http://127.0.0.1:8787
```

前端通过 Vite 代理把 `/api` 转发到 `8787`，与生产环境的相对路径完全一致。

### 本地数据

- 数据文件：`.data/local-kv.json`（首次请求自动写入默认分类）。
- 覆盖路径：`KV_FILE=/path/to/kv.json npm run dev:api`。
- 本地默认免密（`AUTH_DISABLED=1`）；要验证鉴权链路：

```bash
AUTH_DISABLED=0 AUTH_TOKEN=my-token npm run dev:api
```

### 演示数据

```bash
npm run seed        # 写入演示器件、位置与项目
npm run seed:clean  # 按 .data/demo-ids.json 清理
```

## 质量门禁

```bash
npm run typecheck   # vue-tsc，0 错误
npm run test:unit   # 领域与用例单测（MemoryKV，无需服务）
npm run test:api    # 进程内 API 契约测试（无需服务）
npm run build       # 生产构建
npm run check       # 路径自检 + 以上四项串行执行
npm run check:paths # 单独验证代码不含本机绝对路径（项目目录改名后运行）
```

## 逐模块功能验证

```bash
npm run verify           # 完整门禁 + 后端模块闭环 + 前端逐路由（需先启动 dev:all）
npm run verify:modules   # 后端 8 个模块，隔离实例自启动/自清理，不触碰演示库
npm run verify:ui        # 浏览器逐路由、全局快捷键、主题、移动端与登录页
```

`verify:modules` 通过 `PORT` 与 `KV_FILE` 环境变量启动独立 API 实例（默认 8788 + 临时 KV），
结束自动关闭并删除临时数据；`verify:ui` 只读，不写演示库。截图输出到 `tests/.artifacts/modules/`。
逐模块结论见 [逐模块验证报告](VERIFICATION-REPORT.md)。

UI 端到端验证需要先启动 `npm run dev:all`：

```bash
npm run test:e2e                                  # 快捷键 / 扫码 / 右键菜单 / 看板
node tests/e2e/ui-smoke.mjs                       # 全路由冒烟与控制台错误
node tests/e2e/ui-projects.mjs                    # 项目 BOM 交互
node tests/e2e/ui-realtime.mjs                    # 扫码后看板自动刷新
node tests/e2e/ui-dashboard-layout.mjs            # 看板拖拽排序
node tests/e2e/ui-project-context-menu.mjs        # 项目行右键菜单
node tests/e2e/ui-qr-decode.mjs                   # 标签二维码解码
node tests/e2e/ui-report-improvements.mjs          # 品牌标记、操作日志明暗/移动、恢复确认
```

截图输出到 `tests/.artifacts/`（已忽略提交）。

## 代码约定

- 前端使用 `@/` 别名，服务端与脚本使用带 `.js` 后缀的相对路径。
- 新增文件遵循 `docs/ARCHITECTURE.md` 的分层与依赖规则。
- 组件按需引入 naive-ui，不做全量注册，避免首屏体积膨胀。
- 注释说明「为什么」，不复述代码；对外函数写清约束与返回值。

## 部署到 EdgeOne Pages

1. 推送仓库并在 EdgeOne Pages 创建项目；`edgeone.json` 已声明构建命令 `npm run build`、产物目录 `dist`、Node `22.11.0`。
2. 边缘函数入口为 `edge-functions/api/[[default]].js`（`/api` 下多级 catch-all，默认导出 `onRequest`），EdgeOne 按 `edge-functions` 目录生成路由。
3. 创建边缘 KV 命名空间 `leeco-partshub`，绑定为 Edge Functions 变量 `KV`。EdgeOne KV 的 key 只允许字母/数字/下划线，适配器会把业务 key（含 `:` 与中文标签）编码为十六进制，`list` 自动按单页 256 条分页。
4. 配置环境变量 `AUTH_TOKEN`（强随机值，切勿提交到仓库）；不要配置 `AUTH_DISABLED`。安全默认：绑定了 `env.KV` 但漏配 `AUTH_TOKEN` 时接口直接返回 401，避免线上裸奔。
5. 首次访问任意接口会写入默认分类；如需迁移本地数据，可在「备份与设置」导出后于线上恢复。

### 线上限制与自检

Edge Functions 单次请求体上限 **1MB**、CPU 时间 200ms（I/O 不计）。前端已做对应保护：

| 入口 | 线上限制 | 行为 |
| --- | --- | --- |
| 器件附件 | 单文件 300KB、单器件合计 600KB | 超限时提示改用外链；`npm run dev` 下仍为 2MB / 6MB |
| 备份恢复 | 900KB | 超限时提示拆分或使用不含附件的备份 |
| 导入预览 / 提交 | 约 900KB | 超限时提示拆分成多批 |

部署前运行 `npm run check`（路径自检 + 类型检查 + 单测 + API 契约 + 构建）。`dist` 使用 Hash 路由，无需配置 SPA 回退重写。

> EdgeOne KV 为最终一致存储（约 60s 全球同步），单用户低并发场景可接受；多端同时写同一索引时可能短暂读到旧值，批量导入后建议稍等再刷新。

可选：将 `dist` 上传至腾讯云 COS 私有桶，由 EdgeOne 回源加速，静态资源无需公开读。

## 配置项

| 变量 | 作用 | 生产要求 |
| --- | --- | --- |
| `AUTH_TOKEN` | 接口令牌，前端登录时输入相同值 | 必填，勿提交到仓库 |
| `AUTH_DISABLED` | `1` 时跳过鉴权 | **禁止**设置 |
| `KV` | EdgeOne 边缘 KV 绑定（全局变量或 `env.KV`） | 由控制台注入 |
| `KV_FILE` | 本地 FileKV 路径（默认 `.data/local-kv.json`） | 仅本地 |
| `PORT` | 本地 API 端口（默认 `8787`） | 仅本地，用于并行隔离实例 |

## 新增能力速查

- **操作日志**：侧栏「操作日志」或 `Alt+9`，`/api/audit` 支持按动作 / 来源 / 器件 / 关键词过滤。
- **导入撤销**：提交后 10 分钟内结果栏显示倒计时与撤销按钮，服务端按 `batchId` 只删除本次新建对象。
- **恢复防护**：上传备份 → 服务端预演 → 输入 `RESTORE` → 覆盖写入；写入失败整体回滚，会话内可手动回滚。
- **扫码合并**：同器件 + 同库位 + 同单价的连续扫码并入同一批次，不再产生大量 `quantity=1` 碎片。
- **品牌文案**：`src/shared/brand.ts`（前端）与 `server/domain/brand.js`（二维码）是唯一来源；改名前先确认 `LEGACY_BRAND_TITLES` 已包含旧名，避免旧标签失效。
