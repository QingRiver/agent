import type { HitlSseEvent } from '../lib/hitlWorkflow'
import { createFileRoute } from '@tanstack/react-router'
import { useCallback, useRef, useState } from 'react'
import { resumeHitlWorkflow, startHitlWorkflow } from '../lib/hitlWorkflow'

export const Route = createFileRoute('/hitl')({
  component: HitlPage,
})

const DEFAULT_INPUT = '向账户 0x123... 转账 100 ETH'

function HitlPage() {
  const [input, setInput] = useState(DEFAULT_INPUT)
  const [lines, setLines] = useState<string[]>([])
  const [status, setStatus] = useState<'idle' | 'running' | 'waiting' | 'done' | 'error'>('idle')
  const [pendingThreadId, setPendingThreadId] = useState<string | null>(null)
  const [pendingAction, setPendingAction] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const waitingRef = useRef(false)

  const appendLine = useCallback((text: string) => {
    setLines(prev => [...prev, text])
  }, [])

  const formatEvent = useCallback((event: HitlSseEvent): string => {
    if (event.type === 'start')
      return `[start] phase=${event.phase ?? '-'}`
    if (event.type === 'step')
      return `[step ${event.step ?? '?'}] ${JSON.stringify(event.data)}`
    if (event.type === 'waiting')
      return `[waiting] threadId=${event.threadId ?? event.sessionId} action="${event.data}"`
    if (event.type === 'final')
      return `[final] ${JSON.stringify(event.data)}`
    if (event.type === 'error')
      return `[error] ${event.message}`
    if (event.type === 'phase_done')
      return `[phase_done] ${event.phase}`
    return JSON.stringify(event)
  }, [])

  const handleEvent = useCallback((event: HitlSseEvent) => {
    appendLine(formatEvent(event))

    const threadId = event.threadId ?? event.sessionId
    if (event.type === 'waiting' && threadId) {
      waitingRef.current = true
      setPendingThreadId(threadId)
      setPendingAction(typeof event.data === 'string' ? event.data : String(event.data))
      setStatus('waiting')
    }

    if (event.type === 'final')
      setStatus('done')
  }, [appendLine, formatEvent])

  const runWorkflow = useCallback(async () => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setLines([])
    setError(null)
    setPendingThreadId(null)
    setPendingAction(null)
    waitingRef.current = false
    setStatus('running')
    appendLine('-> [Orchestrator] 启动 Agent 流程...')

    try {
      await startHitlWorkflow(input, handleEvent, controller.signal)
      if (!waitingRef.current)
        setStatus('done')
    }
    catch (err) {
      if (controller.signal.aborted)
        return
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg)
      setStatus('error')
      appendLine(`[error] ${msg}`)
    }
  }, [appendLine, handleEvent, input])

  const submitApproval = useCallback(async (approved: boolean) => {
    if (!pendingThreadId)
      return

    const threadId = pendingThreadId
    setPendingThreadId(null)
    setStatus('running')
    appendLine(`[系统] 人工决策: ${approved ? '批准' : '拒绝'}`)

    try {
      await resumeHitlWorkflow(
        threadId,
        approved ? { approved: true } : { approved: false, reason: '用户拒绝' },
        handleEvent,
        abortRef.current?.signal,
      )
    }
    catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg)
      setStatus('error')
      appendLine(`[error] ${msg}`)
    }
  }, [appendLine, handleEvent, pendingThreadId])

  return (
    <main className="mx-auto max-w-4xl p-6">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
        <h1 className="text-2xl font-semibold">人在回路（Human-in-the-Loop）</h1>
        <p className="mt-2 text-sm text-slate-400">
          LangGraph
          {' '}
          <code className="rounded bg-slate-800 px-1.5 py-0.5">interrupt()</code>
          {' '}
          + MemorySaver 挂起 → 前端审批 →
          {' '}
          <code className="rounded bg-slate-800 px-1.5 py-0.5">Command(resume)</code>
          {' '}
          按 thread_id 恢复
        </p>

        <label className="mt-4 block text-sm text-slate-300">
          敏感操作描述
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            disabled={status === 'running' || status === 'waiting'}
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 disabled:opacity-50"
          />
        </label>

        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={runWorkflow}
            disabled={status === 'running' || status === 'waiting'}
            className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            启动 Agent 流程
          </button>
          {status === 'waiting' && (
            <>
              <button
                type="button"
                onClick={() => submitApproval(true)}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium hover:bg-blue-500"
              >
                批准
              </button>
              <button
                type="button"
                onClick={() => submitApproval(false)}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium hover:bg-red-500"
              >
                拒绝
              </button>
            </>
          )}
          <span className="self-center text-sm text-slate-400">
            状态:
            {' '}
            {status}
          </span>
        </div>

        {pendingAction && status === 'waiting' && (
          <div className="mt-4 rounded-lg border border-amber-700/50 bg-amber-950/40 p-4 text-sm text-amber-200">
            <strong>待审批操作：</strong>
            {pendingAction}
          </div>
        )}

        {error && (
          <p className="mt-3 text-sm text-red-400">{error}</p>
        )}

        <pre className="mt-4 max-h-[50vh] overflow-auto rounded-lg border border-slate-800 bg-slate-950 p-4 font-mono text-xs leading-relaxed text-emerald-300">
          {lines.length > 0 ? lines.join('\n') : '等待流式输出...'}
        </pre>
      </div>
    </main>
  )
}
