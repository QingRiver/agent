import { useAgentContext } from '@copilotkit/react-core/v2'
import { useState } from 'react'

const DEFAULT_INPUT = '向账户 0x123... 转账 100 ETH'

export function HitlContextPanel() {
  const [sensitiveInput, setSensitiveInput] = useState(DEFAULT_INPUT)

  useAgentContext({
    description: '待审批的敏感操作描述，传入 LangGraph 的 input 字段',
    value: { input: sensitiveInput },
  })

  return (
    <label className="mt-4 block text-sm text-slate-300">
      敏感操作描述
      <input
        type="text"
        value={sensitiveInput}
        onChange={e => setSensitiveInput(e.target.value)}
        className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
      />
    </label>
  )
}
