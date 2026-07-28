import type { ReactAgentLabConfig } from './agentLabConfig'
import { useAgent } from '@copilotkit/react-core/v2'
import { useEffect, useRef } from 'react'

interface AgentLabStateBridgeProps {
  config: ReactAgentLabConfig
}

/** 将 Lab 配置注入 CopilotKit agent.state，供 reactAgent resolveConfigurable 使用 */
export function AgentLabStateBridge({ config }: AgentLabStateBridgeProps) {
  const { agent } = useAgent({ agentId: 'reactAgent' })
  const configRef = useRef(config)
  configRef.current = config
  const patchedRef = useRef(false)

  useEffect(() => {
    if (!agent || patchedRef.current)
      return

    const originalRun = agent.runAgent.bind(agent)
    agent.runAgent = async (args, options) => {
      const c = configRef.current
      const patch = {
        userPrompt: c.userPrompt,
        kbId: c.kbId,
        maxSteps: c.maxSteps,
      }
      if (agent.state == null || typeof agent.state !== 'object')
        agent.state = { ...patch }
      else
        Object.assign(agent.state as Record<string, unknown>, patch)

      return originalRun(args, options)
    }

    patchedRef.current = true
    return () => {
      agent.runAgent = originalRun
      patchedRef.current = false
    }
  }, [agent])

  return null
}
