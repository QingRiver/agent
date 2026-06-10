import type { SseMessage } from '@apis/stream-sample-sse'
import { streamSimpleGraph } from '@apis/stream-sample-sse'
import { useCallback, useRef, useState } from 'react'

export function SimpleGraphSsePanel() {
  const [lines, setLines] = useState<string[]>([])
  const [status, setStatus] = useState<'idle' | 'streaming' | 'done' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const appendLine = useCallback((text: string) => {
    setLines(prev => [...prev, text])
  }, [])

  const startStream = useCallback(async () => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setLines([])
    setError(null)
    setStatus('streaming')
    appendLine(`[${new Date().toISOString()}] connecting...`)

    try {
      await streamSimpleGraph({
        signal: controller.signal,
        onMessage: (message: SseMessage) => {
          if (message.type === 'start') {
            appendLine(`[${new Date().toISOString()}] stream started`)
            return
          }
          if (message.type === 'update') {
            appendLine(`[update] ${JSON.stringify(message.data)}`)
            return
          }
          if (message.type === 'done') {
            appendLine(`[${new Date().toISOString()}] stream done`)
            return
          }
          if (message.type === 'error') {
            appendLine(`[error] ${message.message ?? 'unknown error'}`)
          }
        },
      })
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
  }, [appendLine])

  const stopStream = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setStatus('idle')
    appendLine(`[${new Date().toISOString()}] aborted`)
  }, [appendLine])

  return (
    <>
      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={startStream}
          disabled={status === 'streaming'}
          className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
        >
          开始流式请求
        </button>
        <button
          type="button"
          onClick={stopStream}
          disabled={status !== 'streaming'}
          className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          停止
        </button>
        <span className="self-center text-sm text-slate-400">
          状态:
          {' '}
          {status}
        </span>
      </div>

      {error && (
        <p className="mt-3 text-sm text-red-400">{error}</p>
      )}

      <pre className="mt-4 max-h-[60vh] overflow-auto rounded-lg border border-slate-800 bg-slate-950 p-4 font-mono text-xs leading-relaxed text-emerald-300">
        {lines.length > 0 ? lines.join('\n') : '等待流式输出...'}
      </pre>
    </>
  )
}
