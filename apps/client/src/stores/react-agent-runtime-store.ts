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
}
