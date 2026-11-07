# 樂創元件仓 Leeco PartsHub

面向个人与小团队的元器件库存管理系统：从多渠道订单导入，到分类检索、批次与库位管理、
扫码出入库、BOM 齐套与项目领料，一条链路跑完「找料 → 验料 → 用料」。

- 前端：Vue 3 + TypeScript + Vite + Pinia + Naive UI
- 服务端：EdgeOne Serverless（边缘函数 + 边缘 KV），本地用 Node 服务与 FileKV 等价运行
- 部署：静态产物 `dist` + `functions/api/[...path].js` catch-all 入口

![总览看板](docs/assets/dashboard.png)

## 快速开始

```bash
npm ci
npm run dev:all     # 前端 5173 + API 8787
```

打开 <http://127.0.0.1:5173>，本地默认免密。演示数据：

```bash
npm run seed
```

## 质量门禁

```bash
npm run check       # typecheck + 单测 + 接口契约 + 构建
```

当前基线：单测 116 项、接口契约 30 项，`vue-tsc` 0 错误。

## 目录一览

```text
src/
  app/        应用壳：路由、布局、全局命令面板
  modules/    业务模块：auth / dashboard / catalog / inventory / bom / projects / procurement / labels / platform
  shared/     跨模块共享：API、设计系统组件、主题与全局状态
  styles/     设计令牌与全局样式
server/
  domain/         纯业务规则（无 IO）
  application/    用例编排
  repositories/   KV 持久化与索引
  infrastructure/ KV 适配器与种子数据
  http/           路由表、鉴权、统一响应
functions/    EdgeOne 边缘入口（薄适配）
tests/        unit / integration / e2e
tools/        本地 API 服务与演示数据脚本
```

依赖方向与扩展方式见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)。

## 文档

- [架构说明](docs/ARCHITECTURE.md)：分层、依赖规则、KV 键设计、请求链路、扩展指引
- [开发与部署](docs/DEVELOPMENT.md)：环境、脚本、本地数据、测试、EdgeOne 部署
- [API 参考](docs/API.md)：全部接口、参数与业务约束
- [ADR 0001](docs/adr/0001-layered-architecture.md)：为什么采用当前分层

## 功能范围

| 模块 | 能力 |
| --- | --- |
| 元器件 | 树形分类、参数归一化、EIA/工程单位检索、安全库存、替代料、供应商料号 |
| 库存 | 批次、库位、FIFO 出库、移动位置、流水追溯、扫码出入库 |
| BOM | 粘贴/Excel/CSV 解析、多级匹配、缺料汇总、一键领料、保存为项目 |
| 项目 | 项目 BOM、投产套数换算、齐套率、按项目领料、导出 CSV |
| 标签 | 46×30mm / 60×40mm 标签，二维码承载器件与参数，A4 版式预览 |
| 效率 | 全局快捷键、右键菜单、可拖拽自定义看板、命令面板 |
| 数据 | 全量导出/恢复、位置与器件二维码、暗色主题、移动端适配 |

## 部署

构建命令 `npm run build`，产物 `dist`；边缘函数目录 `functions`；绑定 KV 命名空间
`leeco-partshub` 到环境变量 `KV`；配置强随机 `AUTH_TOKEN`。详细步骤见
[docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)。
