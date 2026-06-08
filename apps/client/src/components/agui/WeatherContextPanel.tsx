import { useAgentContext } from '@copilotkit/react-core/v2'
import { useState } from 'react'

const DEFAULT_MESSAGE = '北京今天天气怎么样？'

export function WeatherContextPanel() {
  const [message, setMessage] = useState(DEFAULT_MESSAGE)

  useAgentContext({
    description: '用户天气查询，传入 weather graph',
    value: { message },
  })

  return (
    <label className="mt-4 block text-sm text-slate-300">
      默认查询（会作为 Agent context）
      <input
        type="text"
        value={message}
        onChange={e => setMessage(e.target.value)}
        className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
      />
    </label>
  )
}
