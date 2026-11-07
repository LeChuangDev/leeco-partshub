// tools/dev-server/file-kv.js
// 本地开发用 KV：在 MemoryKV 基础上把数据持久化到 JSON 文件。
// 仅用于本地开发 / 验证，生产由真实 EdgeOne KV 取代。
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { MemoryKV } from '../../server/infrastructure/kv/index.js'

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
