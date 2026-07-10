#!/usr/bin/env tsx
/**
 * qlib 每日数据更新编排
 *
 * init   - 首次初始化（Docker + 检查数据目录）
 * update - 增量同步 CSV + 按需 dump bin（先日历，再更新有变动的股票）
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const QLIB_ROOT = join(REPO_ROOT, 'infra/qlib')
const SOURCE_BARS = join(QLIB_ROOT, 'source/cn_1d')
const QLIB_DATA = join(QLIB_ROOT, 'qlib_data/cn_data')
const CONTAINER = 'qlib-api'

function log(msg: string): void {
  console.log(msg)
}

function fail(msg: string): never {
  console.error(`\n错误: ${msg}`)
  process.exit(1)
}

function run(cmd: string, args: string[], opts: { cwd?: string, inherit?: boolean } = {}): void {
  const r = spawnSync(cmd, args, {
    cwd: opts.cwd ?? REPO_ROOT,
    stdio: opts.inherit === false ? 'pipe' : 'inherit',
    encoding: 'utf8',
  })
  if (r.status !== 0) {
    const detail = typeof r.stderr === 'string' ? r.stderr.trim() : ''
    fail(`${cmd} ${args.join(' ')} 失败 (exit ${r.status ?? 'unknown'})${detail ? `\n${detail}` : ''}`)
  }
}

function runCapture(cmd: string, args: string[]): string {
  const r = spawnSync(cmd, args, { cwd: QLIB_ROOT, encoding: 'utf8' })
  if (r.status !== 0)
    return ''
  return (r.stdout ?? '').trim()
}

function isDockerRunning(): boolean {
  const r = spawnSync('docker', ['info'], { stdio: 'pipe' })
  return r.status === 0
}

function isContainerRunning(name: string): boolean {
  const id = runCapture('docker', ['ps', '--filter', `name=${name}`, '--filter', 'status=running', '-q'])
  return id.length > 0
}

function countCsv(): number {
  if (!existsSync(SOURCE_BARS))
    return 0
  return readdirSync(SOURCE_BARS).filter(f => f.endsWith('.csv')).length
}

function hasQlibData(): boolean {
  return existsSync(join(QLIB_DATA, 'calendars/day.txt'))
}

function ensureDocker(): void {
  if (isDockerRunning())
    return
  fail(
    'Docker 未运行，请先启动 Docker Desktop。\n'
    + '  macOS: open -a Docker\n'
    + '启动后重试: pnpm devops qlib update',
  )
}

function ensureContainer(build = false): void {
  ensureDocker()
  if (isContainerRunning(CONTAINER))
    return
  log(`→ ${CONTAINER} 未运行，正在启动 …`)
  const args = build ? ['compose', 'up', '-d', '--build'] : ['compose', 'up', '-d']
  run('docker', args, { cwd: QLIB_ROOT })
  if (!isContainerRunning(CONTAINER))
    fail(`${CONTAINER} 启动失败，请检查: cd infra/qlib && docker compose logs`)
  log(`→ ${CONTAINER} 已就绪`)
}

function dockerExec(script: string, args: string[] = []): void {
  run('docker', ['compose', 'exec', '-T', CONTAINER, 'python', script, ...args], { cwd: QLIB_ROOT })
}

function readWatermark(): string {
  const out = runCapture('docker', [
    'compose',
    'exec',
    '-T',
    CONTAINER,
    'python',
    '-c',
    'import json;from pathlib import Path;p=Path("/app/source/sync_meta.json");'
    + 'print(json.loads(p.read_text()).get("last_success_trade_date","") if p.exists() else "")',
  ])
  return out
}

function cmdInit(): void {
  log('=== qlib 初始化 ===\n')
  ensureContainer(true)

  const csvCount = countCsv()
  if (csvCount === 0) {
    log('→ source/cn_1d 无 CSV，请先解包共享数据:')
    log('  pnpm devops qlib unpack')
    log('或执行历史回填后再 dump。')
  }
  else {
    log(`→ source/cn_1d: ${csvCount} 只 CSV`)
  }

  if (!hasQlibData()) {
    if (csvCount === 0) {
      log('\n初始化未完成：缺少 CSV 与 qlib_data。')
      return
    }
    log('\n→ qlib_data 未初始化，执行全量 dump（首次较慢）…')
    dockerExec('scripts/dump_bin.py', [
      'dump_all',
      '--data_path',
      '/app/source/cn_1d',
      '--qlib_dir',
      '/root/.qlib/qlib_data/cn_data',
      '--freq',
      'day',
      '--date_field_name',
      'date',
      '--symbol_field_name',
      'symbol',
      '--exclude_fields',
      'date,symbol',
    ])
  }
  else {
    log('→ qlib_data 已存在，跳过全量 dump')
  }

  log('\n初始化完成。日常更新请执行:')
  log('  pnpm devops qlib update')
}

function cmdUpdate(tradeDate?: string, dryRun = false): void {
  log('=== qlib 每日更新 ===\n')
  ensureContainer(true)

  const csvCount = countCsv()
  if (csvCount === 0)
    fail('source/cn_1d 无 CSV，请先 pnpm devops qlib unpack 或回填历史数据')

  const watermark = readWatermark()
  if (watermark)
    log(`→ 当前水位: ${watermark}`)

  log('\n[1/2] 增量同步 CSV（Tushare → cn_1d）…')
  const syncArgs = ['scripts/init_tushare_data.py', '--mode', 'incremental', '--skip-dump']
  if (tradeDate)
    syncArgs.push('--trade-date', tradeDate)
  run('docker', ['compose', 'exec', '-T', CONTAINER, 'python', ...syncArgs], { cwd: QLIB_ROOT })

  log('\n[2/2] 增量 dump qlib bin（先日历，再更新变动股票）…')
  dockerExec('scripts/dump_daily.py', dryRun ? ['--dry-run'] : [])

  const newWatermark = readWatermark()
  log(`\n完成。水位: ${newWatermark || watermark || '(未知)'}`)
  if (!hasQlibData())
    log('提示: qlib_data 仍为空，请执行 pnpm devops qlib init')
}

function printHelp(): void {
  console.log(`用法:
  pnpm devops qlib init              首次初始化（启动 Docker、检查数据、必要时全量 dump）
  pnpm devops qlib update            每日更新（增量 CSV + 按需 dump bin）
  pnpm devops qlib update -- --date 20260702   补洞至指定交易日
  pnpm devops qlib update -- --dry-run         仅预览 dump 计划

说明:
  - 自动检测 Docker / qlib-api 容器；未运行时提示并尝试启动
  - dump 不会扫描全市场重写字段，仅更新日历 + 有新区间的股票
  - 首次无 qlib_data 时请用 devops qlib init
`)
}

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    'date': { type: 'string', short: 'd' },
    'dry-run': { type: 'boolean', default: false },
    'help': { type: 'boolean', short: 'h', default: false },
  },
})

const command = positionals[0] ?? 'update'

if (values.help) {
  printHelp()
  process.exit(0)
}

if (command === 'init')
  cmdInit()
else if (command === 'update' || command === 'daily')
  cmdUpdate(values.date, values['dry-run'])
else
  fail(`未知命令: ${command}。使用 --help 查看用法`)
