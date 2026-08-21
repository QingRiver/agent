import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { env } from '@agent/env'

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function fail(message: string): never {
  console.error(`\n[dev] ${message}\n`)
  process.exit(1)
}

function checkNodeVersion(): void {
  const major = Number.parseInt(process.versions.node.split('.')[0] ?? '0', 10)
  if (major < 24) {
    fail(`需要 Node.js >= 24，当前为 ${process.versions.node}`)
  }
  console.log(`[dev] Node ${process.versions.node} ✓`)
}

function logEnv(): void {
  console.log('[dev] OPENAI_API_KEY ✓')
  console.log(`[dev] OPENAI_BASE_URL ✓ (${env.OPENAI_BASE_URL})`)
}

function checkCertificates(): void {
  const certDir = path.join(serverRoot, 'certificates')
  const keyPath = path.join(certDir, 'localhost-key.pem')
  const certPath = path.join(certDir, 'localhost.pem')

  for (const file of [keyPath, certPath]) {
    if (!fs.existsSync(file)) {
      fail(
        `缺少证书 ${file}，请执行：pnpm --filter server cert`,
      )
    }
    try {
      const content = fs.readFileSync(file, 'utf8')
      if (!content.includes('-----BEGIN'))
        fail(`证书文件格式异常：${file}`)
    }
    catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      fail(`无法读取证书 ${file}：${message}`)
    }
  }
  console.log('[dev] certificates ✓')
}

function runServer(): void {
  console.log('[dev] 启动 tsx watch …\n')
  const child = spawn('tsx', ['watch', 'src/index.ts'], {
    cwd: serverRoot,
    stdio: 'inherit',
    env: process.env,
  })

  child.on('error', (err) => {
    fail(`无法启动 tsx：${err.message}`)
  })

  child.on('exit', (code, signal) => {
    if (signal)
      process.kill(process.pid, signal)
    process.exit(code ?? 0)
  })
}

checkNodeVersion()
logEnv()
checkCertificates()
runServer()
