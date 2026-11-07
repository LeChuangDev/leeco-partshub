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
npm run check       # 以上四项串行执行
```

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

1. 推送仓库并在 EdgeOne Pages 创建项目，构建命令 `npm run build`，产物目录 `dist`。
2. 边缘函数目录为 `functions`，入口 `functions/api/[...path].js`（catch-all）。
3. 创建边缘 KV 命名空间 `leeco-partshub`，绑定到函数环境变量 `KV`。
4. 配置环境变量 `AUTH_TOKEN`（强随机值，切勿提交到仓库）；不要配置 `AUTH_DISABLED`。
5. 首次访问任意接口会写入默认分类；如需迁移本地数据，可在「备份与设置」导出后于线上恢复。

可选：将 `dist` 上传至腾讯云 COS 私有桶，由 EdgeOne 回源加速，静态资源无需公开读。

## 配置项

| 变量 | 作用 | 生产要求 |
| --- | --- | --- |
| `AUTH_TOKEN` | 接口令牌，前端登录时输入相同值 | 必填 |
| `AUTH_DISABLED` | `1` 时跳过鉴权 | **禁止**设置 |

## 新增能力速查

- **操作日志**：侧栏「操作日志」或 `Alt+9`，`/api/audit` 支持按动作 / 来源 / 器件 / 关键词过滤。
- **导入撤销**：提交后 10 分钟内结果栏显示倒计时与撤销按钮，服务端按 `batchId` 只删除本次新建对象。
- **恢复防护**：上传备份 → 服务端预演 → 输入 `RESTORE` → 覆盖写入；写入失败整体回滚，会话内可手动回滚。
- **扫码合并**：同器件 + 同库位 + 同单价的连续扫码并入同一批次，不再产生大量 `quantity=1` 碎片。

| `KV_FILE` | 本地 FileKV 路径 | 仅本地 |
| `KV` | EdgeOne 边缘 KV 绑定 | 由控制台注入 |
