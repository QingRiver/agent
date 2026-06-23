import type { ConversationConfig, ConversationConfigProviderProps } from './conversation-config'
import { useMemo } from 'react'
import { ConversationConfigContext } from './conversation-config'

/**
 * 对话配置 Provider —— 在树顶注入 driver/tools/systemPrompt
 *
 * value 用 useMemo 稳定引用(配置不变则消费者不重渲染)。
 */
export function ConversationConfigProvider({
  driver,
  tools,
  systemPrompt,
  children,
}: ConversationConfigProviderProps) {
  const value = useMemo<ConversationConfig>(
    () => ({ driver, tools, systemPrompt }),
    [driver, tools, systemPrompt],
  )
  return (
    <ConversationConfigContext value={value}>
      {children}
    </ConversationConfigContext>
  )
}
