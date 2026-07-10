import { INFRA, type InfraTarget } from './paths'
import { containerRunning, ensureDocker, fail, run } from './docker'

interface ServiceDef {
  name: string
  composeDir: string
  container: string
  healthUrl?: string
  buildOnUp?: boolean
}

const SERVICES: Record<Exclude<InfraTarget, 'kb' | 'all'>, ServiceDef> = {
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

function resolveTargets(target: InfraTarget): Array<Exclude<InfraTarget, 'kb' | 'all'>> {
  if (target === 'kb')
    return ['qdrant', 'markitdown']
  if (target === 'all')
    return ['qdrant', 'markitdown', 'qlib']
  return [target]
}

async function checkHealth(url: string): Promise<boolean> {
  try {
    const response = await fetch(url)
    return response.ok
  }
  catch {
    return false
  }
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
    else if (!running)
      health = 'down'

    console.log(`  ${service.name.padEnd(12)} container=${running ? 'running' : 'stopped'.padEnd(7)} health=${health}`)
  }
}
