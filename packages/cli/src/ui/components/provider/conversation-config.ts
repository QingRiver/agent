import type { LlmDriver } from '@core/driver/types'
import type { ToolDef } from '@core/types'
import type { ReactNode } from 'react'
import { createContext, use } from 'react'

export interface ConversationConfig {
  driver: LlmDriver
  tools: ToolDef[]
  systemPrompt: string
}

export const ConversationConfigContext = createContext<ConversationConfig | null>(null)

/** 读取对话配置;须在 <ConversationConfigProvider> 内使用 */
export function useConversationConfig(): ConversationConfig {
  const cfg = use(ConversationConfigContext)
  if (cfg === null)
    throw new Error('useConversation 必须在 <ConversationConfigProvider> 内使用')
  return cfg
}

/** Provider 的 props(便于在 .tsx 中定义组件) */
export interface ConversationConfigProviderProps extends ConversationConfig {
  children?: ReactNode
}
