import type { LangGraphCommand } from '@assistant-ui/react-langgraph'
import { InterruptCard } from '@agent/ui'
import { useLangGraphInterruptState, useLangGraphSendCommand } from '@assistant-ui/react-langgraph'
import { narrowLangGraphInterrupt } from '@lib/langgraphInterrupt'
import { useState } from 'react'

export function DevInterruptUi() {
  const interrupt = useLangGraphInterruptState()
  const sendCommand = useLangGraphSendCommand()
  const [busy, setBusy] = useState(false)
  const request = narrowLangGraphInterrupt(interrupt)

  if (request == null)
    return null

  return (
    <div className={busy ? 'pointer-events-none opacity-60' : undefined}>
      <InterruptCard
        request={request}
        onRespond={(payload) => {
          setBusy(true)
          // LangGraph `interrupt()` 的返回值就是卡片 payload；类型把 resume 标成 string。
          const command = { resume: payload } as unknown as LangGraphCommand
          void sendCommand(command).finally(() => setBusy(false))
        }}
      />
    </div>
  )
}
