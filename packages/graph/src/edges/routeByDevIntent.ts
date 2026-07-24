import type { DevIntent } from '../state/devState'

export type DevRouteTarget = 'agent_weather' | 'agent_order' | 'collect_hitl'

/** 按澄清结果分流到天气 / 订单 / HITL 审批演示 */
export function routeByDevIntent(state: { devIntent: DevIntent }): DevRouteTarget {
  if (state.devIntent === 'simpleTool')
    return 'agent_order'
  if (state.devIntent === 'hitlDemo')
    return 'collect_hitl'
  return 'agent_weather'
}
