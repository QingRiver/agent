import { AGENT_CONFIG_ID_PROPS_KEY } from '@agent/graph/react-agent-prompts'
import { atom, getDefaultStore } from 'jotai'

/**
 * reactAgent 只把 agentConfigId 放进 CopilotKit properties（→ forwardedProps）。
 * 全文配置在服务端按 id 加载（ResolveAgentConfigMiddleware）。
 */
export class ReactAgentRuntimeStore {
  static readonly agentConfigIdAtom = atom<string | null>(null)

  static readonly propertiesAtom = atom((get) => {
    const id = get(ReactAgentRuntimeStore.agentConfigIdAtom)
    return id ? { [AGENT_CONFIG_ID_PROPS_KEY]: id } : {}
  })

  private static store() {
    return getDefaultStore()
  }

  static setAgentConfigId(id: string | null) {
    this.store().set(this.agentConfigIdAtom, id)
  }

  static currentAgentConfigId(): string | null {
    return this.store().get(this.agentConfigIdAtom)
  }

  /** 每轮 run 都带上 agentConfigId，避免 CopilotKit properties 没并进 forwardedProps 时 skill 绑定丢失 */
  static mergeForwardedProps(
    extra?: Record<string, unknown> | undefined,
  ): Record<string, unknown> | undefined {
    const id = this.currentAgentConfigId()
    const out: Record<string, unknown> = {
      ...(id ? { [AGENT_CONFIG_ID_PROPS_KEY]: id } : {}),
      ...extra,
    }
    return Object.keys(out).length > 0 ? out : undefined
  }
}
