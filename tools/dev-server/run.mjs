// tools/dev-server/run.mjs
// 一键启动前端 (Vite) + 本地 API 服务端，方便单命令开发。
import { spawn } from 'node:child_process'

const procs = []
function start(name, cmd, args) {
  const p = spawn(cmd, args, { stdio: 'inherit', shell: true, env: process.env })
  p.on('exit', (code) => {
    console.log(`[${name}] exited with ${code}`)
    shutdown()
  })
  procs.push({ name, p })
}

function shutdown() {
  for (const { p } of procs) {
    try { p.kill('SIGTERM') } catch {}
  }
  process.exit(0)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

console.log('🚀 启动 Leeco PartsHub 开发环境...')
start('api', 'node', ['tools/dev-server/index.mjs'])
start('web', 'npm', ['run', 'dev'])

setTimeout(() => {
  console.log('\n📌 前端: http://127.0.0.1:5173  (已将 /api 代理到 8787)')
  console.log('📌 API : http://127.0.0.1:8787\n')
}, 1500)
