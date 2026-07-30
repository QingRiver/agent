import type { ReactAgentLabConfig } from './agentLabConfig'
import { ReactAgentRuntimeStore } from '@stores/react-agent-runtime-store'
import { useEffect } from 'react'

interface AgentLabStateBridgeProps {
  config: ReactAgentLabConfig
}

/**
 * 将 Lab 运行字段同步到 CopilotKit properties.reactAgent（→ forwardedProps）。
 * 不再 monkey-patch agent.runAgent / 写 agent.state。
 */
export function AgentLabStateBridge({ config }: AgentLabStateBridgeProps) {
  const { userPrompt, kbId, maxSteps } = config

  useEffect(() => {
    ReactAgentRuntimeStore.syncFromLabConfig({ userPrompt, kbId, maxSteps })
  }, [userPrompt, kbId, maxSteps])

  return null
}
