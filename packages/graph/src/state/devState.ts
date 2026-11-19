import type { ApprovalDecision } from '@agent/proto'
import { Annotation, MessagesAnnotation } from '@langchain/langgraph'
import { lastValue } from './lastValue'

/** Dev 演示能力；类型由 const 推导，避免多处手写联合字面量 */
export const DevIntent = {
  weather: 'weather',
  simpleTool: 'simpleTool',
  hitlDemo: 'hitlDemo',
  kb: 'kb',
} as const

export type DevIntent = ValueOf<typeof DevIntent>

export const DEV_INTENT_VALUES = Object.values(DevIntent) as readonly DevIntent[]

export function isDevIntent(value: unknown): value is DevIntent {
  return typeof value === 'string' && (DEV_INTENT_VALUES as readonly string[]).includes(value)
}

/** clarify / intent 分流目标节点名 */
export const DevRouteTarget = {
  agentWeather: 'agent_weather',
  agentOrder: 'agent_order',
  collectHitl: 'collect_hitl',
  agentKb: 'agent_kb',
} as const

export type DevRouteTarget = ValueOf<typeof DevRouteTarget>

/** tool-loop 的 tools 节点名（与 agent 成对） */
export const DevToolsNode = {
  weather: 'tools_weather',
  order: 'tools_order',
  kb: 'tools_kb',
} as const

export type DevToolsNode = ValueOf<typeof DevToolsNode>

/** intent → 图节点；与 DevIntent / DevRouteTarget const 同步 */
export const DEV_INTENT_ROUTE = {
  [DevIntent.weather]: DevRouteTarget.agentWeather,
  [DevIntent.simpleTool]: DevRouteTarget.agentOrder,
  [DevIntent.hitlDemo]: DevRouteTarget.collectHitl,
  [DevIntent.kb]: DevRouteTarget.agentKb,
} as const satisfies Record<DevIntent, DevRouteTarget>

export const DEV_INTENT_ENDS = Object.values(DEV_INTENT_ROUTE)

/** 澄清选项：label / description 与 intent 单表维护 */
export const DEV_CLARIFY_OPTIONS = [
  {
    intent: DevIntent.weather,
    label: '天气查询',
    description: 'Open-Meteo + 天气卡 + ask_*',
  },
  {
    intent: DevIntent.simpleTool,
    label: '简单工具调用',
    description: '模拟取消订单工具',
  },
  {
    intent: DevIntent.hitlDemo,
    label: 'HITL 审批演示',
    description: 'input→select→multiSelect→approval',
  },
  {
    intent: DevIntent.kb,
    label: '知识库检索',
    description: 'kb_search 工具：改写→召回→rerank',
  },
] as const satisfies readonly {
  intent: DevIntent
  label: string
  description: string
}[]

/** hitlDemo 支路执行结果 */
export type HitlDemoResult
  = | { status: 'rejected', reason: string }
    | {
      status: 'approved'
      action: string
      toolInput: string
      userPurpose: string
      priority: string
      extras: string[]
    }

export const DevState = Annotation.Root({
  ...MessagesAnnotation.spec,
  /** 未澄清前为 null；选定后为 DevIntent */
  devIntent: lastValue<DevIntent | null>(() => null),
  input: lastValue<string>(() => ''),
  userPurpose: lastValue<string>(() => ''),
  priority: lastValue<string>(() => ''),
  extras: lastValue<string[]>(() => []),
  approval: lastValue<ApprovalDecision | undefined>(() => undefined),
  result: lastValue<HitlDemoResult | undefined>(() => undefined),
})

export type DevStateType = typeof DevState.State
