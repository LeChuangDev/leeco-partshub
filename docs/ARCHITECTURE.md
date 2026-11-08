# 架构说明

樂創元件库（Leeco PartsHub）采用「前端垂直模块 + 服务端分层」的单仓结构。目标是让业务规则、持久化与 HTTP
三者解耦：同一套领域逻辑既能跑在 EdgeOne 边缘函数，也能在本地 Node 服务与单测中直接调用。

## 1. 目录结构

```text
.
├─ src/                          # 前端应用（Vue 3 + TypeScript）
│  ├─ main.ts                    # 启动装配：Pinia、Router、401 回调
│  ├─ App.vue                    # 主题 / 消息 / 对话框 Provider
│  ├─ app/                       # 应用壳，不含业务规则
│  │  ├─ router/                 # 路由表与登录守卫
│  │  ├─ layouts/                # AppLayout（侧栏、顶栏、全局弹层）
│  │  └─ components/             # CommandPalette 等全局组件
│  ├─ modules/                   # 业务模块（垂直切片，一个模块一个目录）
│  │  ├─ auth/                   # 登录、会话 store
│  │  ├─ dashboard/              # 可自定义看板
│  │  ├─ catalog/                # 元器件主数据
│  │  ├─ inventory/              # 库存、位置、扫码、快速入库（index.ts 对外暴露移动位置弹窗）
│  │  ├─ bom/                    # BOM 齐套
│  │  ├─ projects/               # 项目 BOM
│  │  ├─ procurement/            # 多渠道订单导入
│  │  ├─ labels/                 # 标签打印
│  │  └─ platform/               # 备份与设置、操作日志
│  ├─ shared/                    # 跨模块共享（不得依赖 modules）
│  │  ├─ api/                    # 传输层、资源端点、DTO
│  │  ├─ ui/                     # 设计系统组件与图表
│  │  ├─ stores/                 # 主题、全局弹层状态
│  │  └─ utils/                  # 事件总线等无状态工具
│  └─ styles/global.css          # 设计令牌与全局样式
├─ server/                       # 服务端（只依赖 Web 标准 API）
│  ├─ domain/                    # 纯业务规则：模型、归一化、二维码、扫码、BOM 解析/汇总、参数模板、审计枚举
│  ├─ application/               # 用例编排：目录、出入库、移库、齐套、项目、导入/撤销、统计、备份
│  ├─ repositories/              # KV 持久化：分类、器件、批次、位置、流水、审计、索引
│  ├─ infrastructure/            # KV 适配器（内存 / EdgeOne）与种子数据
│  └─ http/                      # 路由表、鉴权、统一响应、各资源路由
├─ edge-functions/api/[[default]].js # EdgeOne Pages Edge Functions 入口（/api catch-all）
├─ electron/                     # 离线桌面版：主进程 + 本地静态/API 服务（FileKV）
├─ tests/
│  ├─ unit/                      # 领域与用例单测（MemoryKV）
│  ├─ integration/               # 进程内 API 契约测试
│  └─ e2e/                       # Playwright UI 验证（需本地服务）
├─ tools/
│  ├─ dev-server/                # 本地 API 服务 + FileKV
│  └─ seed/                      # 演示数据脚本
└─ docs/                         # 架构、开发、接口与 ADR
```

## 2. 依赖规则

服务端严格单向：

```text
http  →  application  →  repositories  →  infrastructure
              ↓               ↓
           domain  ←─────────┘        （domain 不反向依赖任何层）
```

- `domain` 不允许 import KV、HTTP、Node 内置模块；只允许纯函数与常量。
- `repositories` 只做单个聚合的持久化与索引维护，不编排跨聚合流程。
- `application` 负责组合仓储、校验业务约束、写流水；可以被 HTTP 与测试直接调用。
- `http` 只做参数解析、状态码与响应信封，不写业务规则。

前端同样单向：

```text
app  →  modules  →  shared
```

- `shared` 不得 import `modules`（因此 401 处理改为传输层回调，由 `main.ts` 注入）。
- `modules` 之间默认不互相 import；确需复用能力时，通过目标模块的 `index.ts` 公开出口引用
  （例如 `@/modules/inventory` 暴露「移动存放位置」弹窗），不得直接引用其内部路径。
- 页面可以 import `@server/domain/*` 的纯函数（如二维码文本、BOM 解析），但**不得**引用
  `@server/application`、`@server/repositories`，避免把持久化打进前端包。

## 3. 路径别名

| 别名 | 指向 | 使用范围 |
| --- | --- | --- |
| `@/` | `src/` | 前端全部代码 |
| `@server/` | `server/` | 仅限 `server/domain` 的纯函数 |

服务端、测试与工具脚本使用标准相对路径（含 `.js` 后缀），保证 Node ESM 与边缘运行时可直接解析。

## 4. 数据模型（EdgeOne KV）

键名前缀固定，索引统一为 `index:*`，避免依赖 KV 的 scan 能力：

| 键 | 说明 |
| --- | --- |
| `meta:info` | 版本与最后更新时间 |
| `category:{id}` / `index:categories` | 分类及全量索引 |
| `part:{id}` / `index:parts` | 元器件主数据 |
| `index:parts:cat:{categoryId}` | 分类下器件索引 |
| `index:parts:tag:{tag}` | 标签下器件索引 |
| `stock:{id}` / `index:stock:part:{partId}` | 库存批次 |
| `location:{id}` / `index:locations` | 存储位置 |
| `transaction:{id}` / `index:transactions` / `index:txn:part:{partId}` | 库存流水 |
| `project:{id}` / `index:projects` / `projectbom:{projectId}` | 项目与项目 BOM |
| `audit:{id}` / `index:audit` | 只追加的操作日志（恢复备份不清空） |
| `importbatch:{id}` / `index:importbatches` | 导入批次快照，用于 10 分钟内撤销 |

所有写入通过 `repositories/*` 完成，索引与主记录在同一请求内更新；恢复备份时按记录重建索引。

## 5. 请求链路

```text
浏览器
  → shared/api/endpoints/*（资源方法）
  → shared/api/http.ts（/api + X-Auth-Token + 信封解析）
  → EdgeOne Edge Functions edge-functions/api/[[default]].js
  → server/http/router.js（鉴权 → 路由表 → 统一错误边界）
  → server/http/routes/*.routes.js（参数与状态码）
  → server/application/*.service.js（用例编排）
  → server/repositories/*.repository.js（KV 读写与索引）
```

本地开发把边缘函数替换为 `tools/dev-server/index.mjs`，其余链路完全一致。

## 6. 扩展指引

新增一个资源（以「供应商」为例）：

1. `server/domain/supplier.js`：模型与校验（纯函数）。
2. `server/repositories/supplier.repository.js`：KV 读写与索引。
3. `server/application/supplier.service.js`：跨聚合用例（如需）。
4. `server/http/routes/suppliers.routes.js`：参数解析与响应。
5. 在 `server/http/router.js` 的 `ROUTES` 注册 `suppliers`。
6. `src/shared/api/endpoints/suppliers.api.ts`：资源方法；在 `shared/api/index.ts` 聚合。
7. `src/modules/suppliers/`：视图与组件；路由在 `src/app/router/index.ts` 登记。

每一层只做自己的事，新增资源不需要修改既有资源文件。

## 7. 关键设计取舍

- **不为框架而框架**：没有引入 DI 容器与 ORM。KV 是键值存储，仓储函数直接接收 `kv`，
  测试用 `MemoryKV` 注入即可，比容器更轻且可读。
- **前端复用服务端纯逻辑**：二维码文本、扫码解析、BOM 解析放在 `server/domain`，
  前后端共用一份规则，避免「扫出来的内容与打印的不一致」。
- **401 回调而非 store 直连**：传输层不 import 业务 store，避免循环依赖，也让 API 层可独立测试。
