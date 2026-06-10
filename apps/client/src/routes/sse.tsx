import type { SseDemoId } from '@lib/sseDemos'
import { DEFAULT_SSE_DEMO_ID, SSE_DEMOS } from '@lib/sseDemos'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useState } from 'react'

export const Route = createFileRoute('/sse')({
  component: SsePage,
})

function SsePage() {
  const [selectedDemoId, setSelectedDemoId] = useState<SseDemoId>(DEFAULT_SSE_DEMO_ID)
  const demo = SSE_DEMOS.find(d => d.id === selectedDemoId) ?? SSE_DEMOS[0]

  return (
    <main className="mx-auto max-w-4xl p-6">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
        <p className="text-sm text-slate-500">
          <Link to="/" className="text-emerald-400 hover:underline">← 首页 Chat</Link>
        </p>
        <h1 className="mt-2 text-2xl font-semibold">LangGraph SSE</h1>
        <p className="mt-2 text-sm text-slate-400">
          纯 SSE 流式演示。AG-UI 版见
          {' '}
          <Link to="/" className="text-emerald-400 hover:underline">首页 Chat</Link>
          。
        </p>

        <label className="mt-4 block text-sm text-slate-300">
          选择演示
          <select
            value={selectedDemoId}
            onChange={e => setSelectedDemoId(e.target.value as SseDemoId)}
            className="mt-1 block w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
          >
            {SSE_DEMOS.map(item => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>

        <div className="mt-4">
          <h2 className="text-lg font-medium text-slate-200">{demo.label}</h2>
          <p className="mt-1 text-sm text-slate-400">{demo.description}</p>
          <p className="mt-1 text-xs text-slate-500">
            API:
            {' '}
            <code className="rounded bg-slate-800 px-1.5 py-0.5">{demo.apiHint}</code>
          </p>
        </div>

        <div key={demo.id}>
          {demo.renderPanel()}
        </div>
      </div>
    </main>
  )
}
