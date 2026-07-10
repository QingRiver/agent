#!/usr/bin/env tsx
/**
 * qlib source 数据包：打包 / 解包
 *
 * 打包：reconcile sync_meta + data_manifest，输出 zip 到仓库根目录
 * 解包：从仓库根目录 zip 解压到 infra/qlib/source，并 bootstrap/reconcile
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const QLIB_ROOT = join(REPO_ROOT, 'infra/qlib')
const DEFAULT_SOURCE = join(QLIB_ROOT, 'source')

function resolveRepoPath(path: string): string {
  if (path.startsWith('/'))
    return path
  return resolve(REPO_ROOT, path)
}

interface Manifest {
  schema_version?: number
  packaged_at?: string
  symbol_count?: number
  global_min_date?: string
  global_max_date?: string
}

function log(msg: string): void {
  console.log(msg)
}

function fail(msg: string): never {
  console.error(`错误: ${msg}`)
  process.exit(1)
}

function resolvePython(): string {
  for (const bin of ['python3', 'python']) {
    const r = spawnSync(bin, ['--version'], { encoding: 'utf8' })
    if (r.status === 0)
      return bin
  }
  fail('未找到 python3/python，无法生成 sync_meta / data_manifest')
}

function run(cmd: string, args: string[], opts: { cwd?: string, env?: NodeJS.ProcessEnv } = {}): void {
  const r = spawnSync(cmd, args, {
    cwd: opts.cwd ?? QLIB_ROOT,
    env: opts.env ?? process.env,
    stdio: 'inherit',
  })
  if (r.status !== 0)
    fail(`${cmd} ${args.join(' ')} 失败 (exit ${r.status ?? 'unknown'})`)
}

function reconcileSource(sourceDir: string): void {
  const python = resolvePython()
  log('→ 扫描 CSV，更新 sync_meta.json / data_manifest.json …')
  run(python, ['scripts/reconcile_source.py', '--write-manifest'], {
    env: { ...process.env, QLIB_SOURCE_DIR: sourceDir },
  })
}

function removeMacOsArtifacts(dir: string): void {
  const macosx = join(dirname(dir), '__MACOSX')
  if (existsSync(macosx)) {
    rmSync(macosx, { recursive: true, force: true })
    log(`→ 已删除 ${macosx}`)
  }

  function walk(target: string): void {
    if (!existsSync(target))
      return
    for (const name of readdirSync(target)) {
      const path = join(target, name)
      if (name === '.DS_Store' || name.startsWith('._')) {
        rmSync(path, { force: true })
        continue
      }
      try {
        if (statSync(path).isDirectory())
          walk(path)
      }
      catch {
        // ignore broken symlinks
      }
    }
  }

  walk(dir)
}

function readManifest(sourceDir: string): Manifest | null {
  const path = join(sourceDir, 'data_manifest.json')
  if (!existsSync(path))
    return null
  return JSON.parse(readFileSync(path, 'utf8')) as Manifest
}

function countCsv(sourceDir: string): number {
  const bars = join(sourceDir, 'cn_1d')
  if (!existsSync(bars))
    return 0
  return readdirSync(bars).filter(f => f.endsWith('.csv')).length
}

function requireZip(zipPath: string): string {
  if (!existsSync(zipPath)) {
    fail(
      `未找到 zip 文件: ${zipPath}\n`
      + `请将 source.zip 放到仓库根目录 (${REPO_ROOT})，或使用:\n`
      + `  pnpm qlib:unpack <zip路径>\n`
      + `  pnpm qlib:unpack -o <zip路径>`,
    )
  }
  return zipPath
}

function resolveUnpackZip(zipArg: string | undefined, outputOpt: string): string {
  const candidate = zipArg && zipArg !== 'package' && zipArg !== 'unpack'
    ? zipArg
    : outputOpt
  return requireZip(resolveRepoPath(candidate))
}

function cmdPackage(output: string, sourceDir: string, skipReconcile: boolean): void {
  const barsDir = join(sourceDir, 'cn_1d')
  if (!existsSync(barsDir))
    fail(`缺少 CSV 目录: ${barsDir}`)

  const csvCount = countCsv(sourceDir)
  if (csvCount === 0)
    fail(`${barsDir} 下没有 CSV 文件`)

  log(`source: ${sourceDir}（${csvCount} 只 CSV）`)

  removeMacOsArtifacts(sourceDir)

  if (!skipReconcile)
    reconcileSource(sourceDir)

  const manifest = readManifest(sourceDir)
  if (manifest) {
    log(
      `→ manifest: ${manifest.symbol_count} 只, `
      + `${manifest.global_min_date} ~ ${manifest.global_max_date}`,
    )
  }

  const outputPath = resolveRepoPath(output)
  if (existsSync(outputPath))
    rmSync(outputPath, { force: true })

  const entries = ['source/cn_1d']
  const meta = join(sourceDir, 'sync_meta.json')
  const manifestPath = join(sourceDir, 'data_manifest.json')
  if (existsSync(meta))
    entries.push('source/sync_meta.json')
  if (existsSync(manifestPath))
    entries.push('source/data_manifest.json')

  log(`→ 打包 ${entries.join(', ')}（不含 _runtime / __MACOSX）…`)
  run('zip', [
    '-r',
    outputPath,
    ...entries,
    '-x',
    '*.DS_Store',
    '-x',
    '*/.DS_Store',
    '-x',
    '__MACOSX/*',
    '-x',
    '*/__MACOSX/*',
    '-x',
    'source/_runtime/*',
  ], { cwd: QLIB_ROOT })

  const sizeMb = (statSync(outputPath).size / 1024 / 1024).toFixed(1)
  log(`\n完成: ${outputPath} (${sizeMb} MB)`)
  log('传 zip = 传 CSV 行情，不是传 sync 进度（_runtime 未包含）')
}

function cmdUnpack(zipPath: string, sourceDir: string, skipReconcile: boolean): void {
  const zip = zipPath

  const dest = dirname(sourceDir)
  log(`→ 解压 ${zip} → ${dest}`)
  run('unzip', ['-o', zip, '-d', dest], { cwd: QLIB_ROOT })

  removeMacOsArtifacts(sourceDir)
  removeMacOsArtifacts(dest)

  const csvCount = countCsv(sourceDir)
  log(`→ 已解压 ${csvCount} 只 CSV`)

  if (!skipReconcile) {
    const hasMeta = existsSync(join(sourceDir, 'sync_meta.json'))
    if (!hasMeta)
      log('→ zip 内无 sync_meta.json，将从 CSV bootstrap …')
    reconcileSource(sourceDir)
  }

  const manifest = readManifest(sourceDir)
  if (manifest) {
    log(
      `\n就绪: ${manifest.symbol_count} 只, `
      + `水位范围 ${manifest.global_min_date} ~ ${manifest.global_max_date}`,
    )
  }
  log('下一步: incremental 补最新交易日，再 dump_bin 生成 qlib_data')
}

function printHelp(): void {
  console.log(`用法:
  pnpm qlib:package [选项]          打包 infra/qlib/source → 仓库根目录 source.zip
  pnpm qlib:unpack [zip] [选项]     解压仓库根目录 zip → infra/qlib/source

选项:
  -o, --output <file>     zip 路径（默认仓库根目录 source.zip）
  -s, --source <dir>      source 目录（默认 infra/qlib/source）
  --skip-reconcile        跳过 Python reconcile（不更新 sync_meta / manifest）

示例:
  pnpm qlib:package
  pnpm qlib:package -o qlib-source-20260701.zip
  pnpm qlib:unpack
  pnpm qlib:unpack source.zip
  pnpm qlib:unpack -o qlib-source-20260701.zip
`)
}

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    'output': { type: 'string', short: 'o', default: 'source.zip' },
    'source': { type: 'string', short: 's', default: DEFAULT_SOURCE },
    'skip-reconcile': { type: 'boolean', default: false },
    'help': { type: 'boolean', short: 'h', default: false },
  },
})

const command = positionals[0] ?? 'package'
const sourceDir = resolve(values.source!)

if (values.help) {
  printHelp()
  process.exit(0)
}

if (command === 'package' || command === 'pack') {
  cmdPackage(values.output!, sourceDir, values['skip-reconcile']!)
}
else if (command === 'unpack' || command === 'unzip') {
  const zip = resolveUnpackZip(positionals[1], values.output!)
  cmdUnpack(zip, sourceDir, values['skip-reconcile']!)
}
else {
  fail(`未知命令: ${command}。使用 --help 查看用法`)
}
