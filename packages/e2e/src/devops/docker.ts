import { spawnSync } from 'node:child_process'
import process from 'node:process'

/**
 * Docker / 进程编排的最底层原语。
 * 仅与 shell/docker CLI 交互，不含业务语义；上层 infra/e2e/qlib 复用。
 */

/** 同步执行命令；inherit 透传 stdio，否则 pipe 收集。返回 ok + stdout/stderr。 */
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

/** 不可恢复错误：打印后 exit 1（devops 脚本以退出码表达成败，不抛异常传播） */
export function fail(message: string): never {
  console.error(`\n[devops] 错误: ${message}`)
  process.exit(1)
}

/** Docker 守护进程是否在运行；否则 fail 提示启动 Docker Desktop。 */
export function ensureDocker(): void {
  if (run('docker', ['info'], { inherit: false }).ok)
    return
  fail(
    'Docker 未运行。请先启动 Docker Desktop，再执行 `pnpm devops infra up`。',
  )
}

/** 容器是否处于 running 状态（按容器名过滤 docker ps）。 */
export function containerRunning(name: string): boolean {
  const { ok, stdout } = run(
    'docker',
    ['ps', '--filter', `name=${name}`, '--filter', 'status=running', '-q'],
    { inherit: false },
  )
  return ok && stdout.trim().length > 0
}
