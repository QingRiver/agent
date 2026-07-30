import { useAgent } from '@copilotkit/react-core/v2'
import { useEffect, useEffectEvent } from 'react'

interface KbAgentStateProps {
  kbId?: string
}

/** 将 kbId 注入 CopilotKit agent state，供 kb 图 configurable 使用 */
export function KbAgentState({ kbId = 'kb_default' }: KbAgentStateProps) {
  'use no memo'

  const { agent } = useAgent({ agentId: 'kb' })

  const injectKbId = useEffectEvent(() => {
    if (!agent)
      return
    const prev = agent.state != null && typeof agent.state === 'object'
      ? agent.state
      : {}
    agent.setState({ ...prev, kbId })
  })

  useEffect(() => {
    if (!agent)
      return

    const originalRun = agent.runAgent.bind(agent)
    // eslint-disable-next-line react-compiler/react-compiler -- inject kbId at the AG-UI run boundary
    agent.runAgent = async (args, options) => {
      injectKbId()
      return originalRun(args, options)
    }

    return () => {
      agent.runAgent = originalRun
    }
  }, [agent])

  return null
}
