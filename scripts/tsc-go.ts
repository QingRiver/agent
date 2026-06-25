import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const tsc = join(root, 'node_modules/typescript-go/bin/tsc')
const cwd = process.env.INIT_CWD ?? process.cwd()

const result = spawnSync(tsc, process.argv.slice(2), {
  stdio: 'inherit',
  cwd,
  shell: process.platform === 'win32',
})

process.exit(result.status ?? 1)
