import type { AbstractAgent, MiddlewareFunction } from '@ag-ui/client'
import type { RunAgentInput } from '@ag-ui/core'
import {
  AGENT_CONFIG_ID_PROPS_KEY,
  REACT_AGENT_FORWARDED_PROPS_KEY,
  readAgentConfigId,
} from '@agent/graph'
import { defer, from, switchMap } from 'rxjs'
import { getRequestContext } from '../../context/requestContext'
import { SkillService } from '../../service/skill'
import { loadAgentConfig, toRuntimeBundle } from '../agentConfig/store'

/**
 * （1）middleware：agentConfigId → 可信 load → 写入 forwardedProps.reactAgent。
 * connectAgent 不跑本链；resolveConfigurable 仍读 reactAgent（由本中间件注入）。
 * 无 id 时透传（兼容过渡 / 非 Lab 路径用默认 sanitize）。
 */
export const resolveAgentConfigMiddleware: MiddlewareFunction = (input, next) => {
  return defer(() => from(enrichInput(input))).pipe(
    switchMap(enriched => next.run(enriched)),
  )
}

async function enrichInput(input: RunAgentInput): Promise<RunAgentInput> {
  const agentConfigId = readAgentConfigId(input)
  if (!agentConfigId)
    return stripClientReactAgentFullText(input)

  const ctx = getRequestContext()
  if (!ctx?.userId)
    throw new Error('ResolveAgentConfig: missing request userId')

  const record = await loadAgentConfig(ctx.userId, agentConfigId)
  if (!record)
    throw new Error(`ResolveAgentConfig: config not found: ${agentConfigId}`)

  const bundle = toRuntimeBundle(record)
  const { skillText, skillBindings } = await SkillService.buildIndex(ctx.userId, record.skillCodes)
  const prev
    = input.forwardedProps != null
      && typeof input.forwardedProps === 'object'
      && !Array.isArray(input.forwardedProps)
      ? { ...(input.forwardedProps as Record<string, unknown>) }
      : {}

  // 丢弃客户端可能夹带的 reactAgent 全文，只保留 id + 服务端组装结果（含 skill 索引，无 files）
  return {
    ...input,
    forwardedProps: {
      ...prev,
      [AGENT_CONFIG_ID_PROPS_KEY]: agentConfigId,
      [REACT_AGENT_FORWARDED_PROPS_KEY]: {
        ...bundle,
        ...(skillText ? { skillText } : {}),
        ...(skillBindings.length > 0 ? { skillBindings } : {}),
      },
    },
  }
}

/** 有 id 以外的路径：忽略客户端 reactAgent 全文，防篡改；靠 resolveConfigurable 默认值 */
function stripClientReactAgentFullText(input: RunAgentInput): RunAgentInput {
  const props = input.forwardedProps
  if (props == null || typeof props !== 'object' || Array.isArray(props))
    return input
  if (!(REACT_AGENT_FORWARDED_PROPS_KEY in (props as object)))
    return input
  const next = { ...(props as Record<string, unknown>) }
  delete next[REACT_AGENT_FORWARDED_PROPS_KEY]
  return { ...input, forwardedProps: next }
}

/** 类型辅助：挂到 AbstractAgent.use */
export function attachResolveAgentConfigMiddleware(agent: AbstractAgent): void {
  agent.use(resolveAgentConfigMiddleware)
}
