#!/usr/bin/env tsx
/**
 * 统一 devops CLI：infra 启停/检查、e2e、qlib 数据
 *
 * 用法见 `.cursor/skills/devops/SKILL.md` 或 `pnpm devops --help`
 */
import process from 'node:process'
import { parseArgs } from 'node:util'
import { runE2e } from './lib/e2e'
import { infraDown, infraStatus, infraUp } from './lib/infra'
import type { InfraTarget } from './lib/paths'
import { fail } from './lib/docker'
import { qlibInit, qlibPackage, qlibUpdate } from './lib/qlib'

function printHelp(): void {
  console.log(`用法: pnpm devops <command> [subcommand] [options]

infra — Docker 基础设施
  up [qdrant|markitdown|qlib|kb|all] [--build]   启动（kb = qdrant + markitdown）
  down [qdrant|markitdown|qlib|kb|all]            停止
  status [qdrant|markitdown|qlib|kb|all]          容器 + 健康检查

e2e — 端到端测试与种子数据
  all              auth seed + kb seed + kb/hitl vitest（不含 agent SSE）
  seed             auth seed + kb seed
  auth             写入 E2E 测试账号到 auth.sqlite
  kb               kb 管线 vitest（需 infra up kb）
  hitl             hitl 图 vitest（不需 server）
  agent            kb agent CopilotKit SSE（需 pnpm dev + e2e seed）
  hitl-agent       hitl agent SSE 全链路（需 pnpm dev + e2e auth）

qlib — 行情数据（委托 scripts/qlib-*.ts）
  init             首次初始化
  update [--date] [--dry-run]
  package [opts]   打包 source
  unpack [opts]    解包 source

示例:
  pnpm devops infra up kb
  pnpm devops infra status all
  pnpm devops e2e all
  pnpm devops qlib update
`)
}

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    build: { type: 'boolean', default: false },
    date: { type: 'string' },
    'dry-run': { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h', default: false },
  },
})

const [command, sub, ...rest] = positionals

if (values.help || !command || command === 'help') {
  printHelp()
  process.exit(0)
}

async function main(): Promise<void> {
  switch (command) {
    case 'infra': {
      const infraVerb = sub as 'up' | 'down' | 'status' | undefined
      const infraTarget = (rest[0] ?? 'kb') as InfraTarget
      if (!infraVerb || !['up', 'down', 'status'].includes(infraVerb))
        fail('infra 子命令须为 up | down | status')
      if (infraVerb === 'up')
        await infraUp(infraTarget, { build: values.build })
      else if (infraVerb === 'down')
        await infraDown(infraTarget)
      else
        await infraStatus(infraTarget)
      break
    }
    case 'e2e': {
      const target = (sub ?? 'all') as Parameters<typeof runE2e>[0]
      runE2e(target)
      break
    }
    case 'qlib': {
      if (!sub)
        fail('qlib 子命令: init | update | package | unpack')
      if (sub === 'init')
        qlibInit()
      else if (sub === 'update') {
        const args: string[] = []
        if (values.date)
          args.push('--date', values.date)
        if (values['dry-run'])
          args.push('--dry-run')
        qlibUpdate(args)
      }
      else if (sub === 'package' || sub === 'unpack')
        qlibPackage(sub, rest)
      else
        fail(`未知 qlib 子命令: ${sub}`)
      break
    }
    default:
      fail(`未知命令: ${command}。执行 pnpm devops --help`)
  }
}

main().catch((error: unknown) => {
  console.error('[devops] 失败:', error)
  process.exit(1)
})
