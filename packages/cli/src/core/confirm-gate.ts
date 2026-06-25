import type { UI } from '@core/types'
import { interact } from '@core/agent-effect'
import { Effect } from 'effect'

/**
 * 默认权限闸门 —— 高权限工具(risk≠safe)执行前的标准 modal 确认,AI 绕不过。
 *
 * 由 agent-loop 在 risk≠safe 时调用。内部就是 `yield* interact({type:'modal'})`,
 * 与 interact 工具共用同一套 UI 确认区机制,零新增组件。
 * - return true:用户确认,继续执行
 * - return false:用户取消,跳过执行
 */
export function defaultConfirmGate(
  name: string,
  args: Record<string, unknown>,
): Effect.Effect<boolean, never, UI> {
  return Effect.gen(function* () {
    const r = yield* interact({
      type: 'modal',
      title: '⚠️ 权限确认',
      body: `即将执行 ${name}\n参数:${JSON.stringify(args)}`,
      actions: ['确认执行', '取消'],
    })
    return (r.payload as { action: string }).action === '确认执行'
  })
}
