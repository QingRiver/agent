import { InterruptCard } from '@agent/ui'
import { useLangGraphInterruptState, useLangGraphSendCommand } from '@assistant-ui/react-langgraph'
import { toInterruptRequest, toLangGraphResumeCommand } from '@lib/langgraphInterrupt'
import { useState } from 'react'

/** HITL 中断卡：统一 InterruptRequest ↔ LangGraph resume Command */
export function LangGraphInterruptUi() {
  const interrupt = useLangGraphInterruptState()
  const sendCommand = useLangGraphSendCommand()
  const [busy, setBusy] = useState(false)
  const request = toInterruptRequest(interrupt)

  if (request == null)
    return null

  return (
    <div className={busy ? 'pointer-events-none opacity-60' : undefined}>
      <InterruptCard
        request={request}
        onRespond={(payload) => {
          setBusy(true)
          void sendCommand(toLangGraphResumeCommand(payload) as Parameters<typeof sendCommand>[0])
            .finally(() => setBusy(false))
        }}
      />
    </div>
  )
}
