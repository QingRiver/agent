import { spawnSync } from 'node:child_process'

export function run(
  cmd: string,
  args: string[],
  opts?: { cwd?: string, inherit?: boolean },
): { ok: boolean, stdout: string, stderr: string } {
  const result = spawnSync(cmd, args, {
    cwd: opts?.cwd,
    stdio: opts?.inherit === false ? 'pipe' : 'inherit',
    encoding: 'utf8',
  })
  return {
    ok: result.status === 0,
    stdout: typeof result.stdout === 'string' ? result.stdout : '',
    stderr: typeof result.stderr === 'string' ? result.stderr : '',
  }
}

export function fail(message: string): never {
  console.error(`\n[devops] 错误: ${message}`)
  process.exit(1)
}

export function ensureDocker(): void {
  if (run('docker', ['info'], { inherit: false }).ok)
    return
  fail(
    'Docker 未运行。请先启动 Docker Desktop，再执行 `pnpm devops infra up`。',
  )
}

export function containerRunning(name: string): boolean {
  const { ok, stdout } = run(
    'docker',
    ['ps', '--filter', `name=${name}`, '--filter', 'status=running', '-q'],
    { inherit: false },
  )
  return ok && stdout.trim().length > 0
}
