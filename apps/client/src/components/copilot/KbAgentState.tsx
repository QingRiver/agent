import { useAgent } from '@copilotkit/react-core/v2'
import { useEffect, useRef } from 'react'

interface KbAgentStateProps {
  kbId?: string
}

/** 将 kbId 注入 CopilotKit agent state，供 kb 图 configurable 使用 */
export function KbAgentState({ kbId = 'kb_default' }: KbAgentStateProps) {
  const { agent } = useAgent({ agentId: 'kb' })
  const patchedRef = useRef(false)

  useEffect(() => {
    if (!agent || patchedRef.current)
      return

    const originalRun = agent.runAgent.bind(agent)
    agent.runAgent = async (args, options) => {
      if (agent.state == null || typeof agent.state !== 'object')
        agent.state = { kbId }
      else
        (agent.state as { kbId?: string }).kbId = kbId

      return originalRun(args, options)
    }

    patchedRef.current = true
    return () => {
      agent.runAgent = originalRun
      patchedRef.current = false
    }
  }, [agent, kbId])

  return null
}
