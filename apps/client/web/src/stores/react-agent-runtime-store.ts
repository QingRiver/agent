import { AGENT_CONFIG_ID_PROPS_KEY } from '@agent/graph/react-agent-prompts'
import { atom, getDefaultStore } from 'jotai'

/**
 * reactAgent 把 agentConfigId 放进图运行的 configurable。
 * 全文配置在服务端按 id 加载。
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

  /** 每轮 run 都带上 agentConfigId，避免 skill 绑定丢失 */
  static mergeConfigurable(
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
