# ADR 0001：分层后端 + 垂直模块前端

- 状态：已接受
- 日期：2026-11-07
- 相关文档：`docs/ARCHITECTURE.md`

## 背景

首版为了快速跑通「找料 → 验料 → 用料」闭环，服务端逻辑集中在 `shared/store.js`、
`shared/router.js` 两个大文件，前端所有页面平铺在 `src/views`、组件统一堆在 `src/components`。
功能增加后出现三个具体问题：

1. 改一个资源的路由需要翻阅 370 行 switch，容易影响其他资源。
2. 仓储、用例与 HTTP 校验混在一起，单测只能整体调用，难以定位失败层。
3. 前端 `shared → modules` 出现反向依赖：HTTP 客户端直接 import auth store 处理 401。

## 决策

服务端按「领域 → 用例 → 仓储 → 基础设施 → HTTP」分层；前端按「app 壳 → 业务模块 → 共享层」
切分，模块之间不互相引用。用路径别名 `@/`、`@server/` 固定依赖方向，服务端与脚本保留相对路径
以兼容 Node ESM 与边缘运行时。

关键约束：

- `server/domain` 不 import 任何 IO。
- `server/repositories` 只服务单个聚合，不编排跨聚合流程。
- `server/http/routes/*` 只处理参数与状态码。
- `src/shared` 不 import `src/modules`；401 改为传输层回调，由 `main.ts` 注入清理逻辑。
- `modules` 之间只允许通过对方 `index.ts` 公开出口引用，禁止直接引用内部路径。
- 前端只能引用 `@server/domain` 的纯函数。

## 后果

收益：

- 新增资源只需新增文件并在路由表登记，不改既有资源。
- 用例可以在测试中直接调用（`tests/integration/api-contract.mjs` 进程内验证 30 项契约）。
- 依赖方向可机械检查：别名只在指定目录使用，越层引用在 review 时一眼可见。

代价：

- 文件数量增加，跨层跳转需要熟悉目录约定。
- 用例层与仓储层的边界需要持续维护；出现「仓储里写业务分支」时应及时上移。

## 未采用方案

- **引入 DI 容器 / ORM**：KV 是键值存储，仓储函数直接接收 `kv` 已足够，容器只会增加间接层。
- **拆成 npm workspaces 多包**：当前只有一个部署单元（EdgeOne Pages），拆包会增加构建与发布成本，
  分层目录已能提供边界约束。
- **前端全量引入 naive-ui**：会让首屏包体翻倍，保持按需引入。
