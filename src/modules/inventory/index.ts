// src/modules/inventory/index.ts
// 库存模块的公开出口。跨模块只能从这里引用，避免直接摸到内部组件路径。
// 目前对外暴露「移动存放位置」弹窗：元器件详情与列表也会触发该操作。

export { default as MoveStockModal } from './components/MoveStockModal.vue'
