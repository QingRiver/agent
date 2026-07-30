import type { ReactAgentRuntimeConfig } from '@agent/graph/react-agent-prompts'
import {
  REACT_AGENT_FORWARDED_PROPS_KEY,
} from '@agent/graph/react-agent-prompts'
import { atom, getDefaultStore } from 'jotai'
import {
  loadAgentLabConfig,
  toReactAgentRuntimeConfig,
} from '../components/agent-lab/agentLabConfig'

function initialRuntime(): ReactAgentRuntimeConfig {
  return toReactAgentRuntimeConfig(loadAgentLabConfig())
}

/**
 * reactAgent 请求级运行配置 → CopilotKit `properties.reactAgent` → `forwardedProps`.
 * 仅 reactAgent 后端读取；其它 agent 忽略。
 */
export class ReactAgentRuntimeStore {
  static readonly runtimeAtom = atom<ReactAgentRuntimeConfig>(initialRuntime())

  /** 稳定引用：仅 runtime 变更时换新对象，供 CopilotKitProvider.properties */
  static readonly propertiesAtom = atom(get => ({
    [REACT_AGENT_FORWARDED_PROPS_KEY]: get(ReactAgentRuntimeStore.runtimeAtom),
  }))

  private static store() {
    return getDefaultStore()
  }

  static setRuntime(config: ReactAgentRuntimeConfig) {
    this.store().set(this.runtimeAtom, config)
  }

  static syncFromLabConfig(
    config: Parameters<typeof toReactAgentRuntimeConfig>[0],
  ) {
    this.setRuntime(toReactAgentRuntimeConfig(config))
  }
}
