import type { InfraTarget } from './paths'
import { containerRunning, ensureDocker, fail, run } from './docker'
import { INFRA } from './paths'

/**
 * infra 容器生命周期：up / down / status。
 * 每个服务一个独立 compose 目录（仿 qlib/qdrant 模式），互不耦合。
 */

interface ServiceDef {
  name: string
  composeDir: string
  container: string
  /** HTTP 健康端点（有则 fetch 探活） */
  healthUrl?: string
  /** 容器内健康检查命令（无 HTTP 端口的服务，如 postgres） */
  healthExec?: string[]
  buildOnUp?: boolean
}

const SERVICES: Record<Exclude<InfraTarget, 'kb' | 'all'>, ServiceDef> = {
  postgres: {
    name: 'postgres',
    composeDir: INFRA.postgres,
    container: 'postgres',
    healthExec: ['pg_isready', '-q'],
  },
  qdrant: {
    name: 'qdrant',
    composeDir: INFRA.qdrant,
    container: 'qdrant',
    healthUrl: 'http://localhost:6333/healthz',
  },
  markitdown: {
    name: 'markitdown',
    composeDir: INFRA.markitdown,
    container: 'markitdown',
    healthUrl: 'http://localhost:8200/health',
    buildOnUp: true,
  },
  qlib: {
    name: 'qlib',
    composeDir: INFRA.qlib,
    container: 'qlib-api',
    healthUrl: 'http://localhost:8000/health',
    buildOnUp: true,
  },
}

/** kb = qdrant + markitdown；all = 全部。 */
function resolveTargets(target: InfraTarget): Array<Exclude<InfraTarget, 'kb' | 'all'>> {
  if (target === 'kb')
    return ['qdrant', 'markitdown']
  if (target === 'all')
    return ['postgres', 'qdrant', 'markitdown', 'qlib']
  return [target]
}

/** HTTP 健康探活（fetch，非 2xx 或网络错误即不健康） */
async function checkHealth(url: string): Promise<boolean> {
  try {
    const response = await fetch(url)
    return response.ok
  }
  catch {
    return false
  }
}

/** 容器内命令探活（docker exec），exit 0 即健康 */
function checkHealthExec(container: string, cmd: string[]): boolean {
  return run('docker', ['exec', container, ...cmd], { inherit: false }).ok
}

function composeUp(service: ServiceDef, build: boolean): void {
  const args = ['compose', 'up', '-d']
  if (build || service.buildOnUp)
    args.push('--build')
  const result = run('docker', args, { cwd: service.composeDir })
  if (!result.ok)
    fail(`${service.name} 启动失败，请检查: cd ${service.composeDir} && docker compose logs`)
}

function composeDown(service: ServiceDef): void {
  const result = run('docker', ['compose', 'down'], { cwd: service.composeDir })
  if (!result.ok)
    fail(`${service.name} 停止失败`)
}

export async function infraUp(target: InfraTarget, options?: { build?: boolean }): Promise<void> {
  ensureDocker()
  const targets = resolveTargets(target)
  console.log(`[devops] infra up: ${targets.join(', ')}`)
  for (const key of targets)
    composeUp(SERVICES[key], options?.build ?? false)
  console.log('[devops] infra up 完成')
}

export async function infraDown(target: InfraTarget): Promise<void> {
  ensureDocker()
  const targets = [...resolveTargets(target)].reverse()
  console.log(`[devops] infra down: ${targets.join(', ')}`)
  for (const key of targets)
    composeDown(SERVICES[key])
  console.log('[devops] infra down 完成')
}

export async function infraStatus(target: InfraTarget): Promise<void> {
  const targets = resolveTargets(target)
  console.log('[devops] infra status\n')
  for (const key of targets) {
    const service = SERVICES[key]
    const running = containerRunning(service.container)
    let health = '—'
    if (running && service.healthUrl)
      health = (await checkHealth(service.healthUrl)) ? 'ok' : 'unhealthy'
    else if (running && service.healthExec)
      health = checkHealthExec(service.container, service.healthExec) ? 'ok' : 'unhealthy'
    else if (!running)
      health = 'down'

    console.log(`  ${service.name.padEnd(12)} container=${running ? 'running' : 'stopped'.padEnd(7)} health=${health}`)
  }
}
