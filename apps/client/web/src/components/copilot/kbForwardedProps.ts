import type { GraphsName } from '@agent/graph'

/** kb agent 本轮 run 的 forwardedProps；其它 agent 不带。 */
export function kbForwardedProps(
  agentId: GraphsName,
  kbId?: string,
): { kbId: string } | undefined {
  return agentId === 'kb' && kbId ? { kbId } : undefined
}
