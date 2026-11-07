// tools/scripts/check-portability.mjs
// 可移植性自检：确认代码与配置里没有写死本机绝对路径。
// 用途：项目文件夹改名 / 换机器后，运行 npm run check:paths 验证无需改代码。
// 只扫描会参与构建与运行的目录；文档与工作记忆中的历史路径不参与判定。

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOTS = ['src', 'server', 'functions', 'tools', 'tests']
const ROOT_FILES = [
  'index.html', 'package.json', 'vite.config.ts', 'tsconfig.json',
  'edgeone.json', '.gitignore', '.editorconfig', '.prettierrc.json'
]
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', '.data', '.artifacts', '.workbuddy'])
const CODE_EXT = /\.(ts|js|mjs|vue|json|html|yml|yaml)$/

// 盘符绝对路径（含 Git Bash 形式）；要求前面是边界，避免把 "category:/part:" 之类字符串误判
const PATTERNS = [
  /(?:^|[\s"'`(])[A-Za-z]:[\\/]/,
  /\/c\/Users\//i,
  /\/Users\/zhang\//i
]

function walk(dir, out = []) {
  if (!existsSync(dir)) return out
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (CODE_EXT.test(name)) out.push(full)
  }
  return out
}

const files = [
  ...ROOT_FILES.filter((f) => existsSync(f)),
  ...ROOTS.flatMap((r) => walk(r))
]

const hits = []
for (const file of files) {
  const lines = readFileSync(file, 'utf8').split(/\r?\n/)
  lines.forEach((line, i) => {
    if (PATTERNS.some((re) => re.test(line))) {
      hits.push(`${relative(process.cwd(), file)}:${i + 1}  ${line.trim().slice(0, 110)}`)
    }
  })
}

if (hits.length) {
  console.error(`可移植性检查：扫描 ${files.length} 个文件，发现 ${hits.length} 处绝对路径硬编码`)
  for (const h of hits) console.error('  - ' + h)
  process.exit(1)
}
console.log(`可移植性检查：扫描 ${files.length} 个文件，0 处绝对路径硬编码 → 项目目录改名不影响运行`)
