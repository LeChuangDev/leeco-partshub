// server/infrastructure/kv/file-kv.js
// 本地/桌面版 KV：在 MemoryKV 基础上把数据持久化到 JSON 文件。
// 仅用于本地开发、验证与 Electron 离线版；生产由真实 EdgeOne KV 取代。
// 注意：本文件依赖 node:fs，只允许 Node 端引用，不要从 kv/index.js 导出（避免打进边缘函数）。
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { MemoryKV } from './memory-kv.js'

export class FileKV extends MemoryKV {
  constructor(file) {
    super()
    this.file = file
    this._load()
  }
  _load() {
    try {
      if (existsSync(this.file)) {
        const obj = JSON.parse(readFileSync(this.file, 'utf8'))
        this.map = new Map(Object.entries(obj || {}))
      }
    } catch (e) {
      console.warn('[FileKV] 读取本地数据失败，使用空库：', e.message)
      this.map = new Map()
    }
  }
  _save() {
    try {
      mkdirSync(dirname(this.file), { recursive: true })
      writeFileSync(this.file, JSON.stringify(Object.fromEntries(this.map)))
    } catch (e) {
      console.warn('[FileKV] 写入本地数据失败：', e.message)
    }
  }
  async put(key, value) {
    await super.put(key, value)
    this._save()
  }
  async del(key) {
    await super.del(key)
    this._save()
  }
}
