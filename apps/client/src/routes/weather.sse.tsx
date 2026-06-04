import type { WeatherChatMessage } from '../lib/parseWeatherUpdate'
import type { SseMessage } from '../lib/streamSampleSse'
import { createFileRoute } from '@tanstack/react-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { WeatherChatBubble } from '../components/weather/WeatherChatBubble'
import { createUserMessage, parseWeatherUpdate } from '../lib/parseWeatherUpdate'
import { streamWeatherGraph } from '../lib/streamSampleSse'

export const Route = createFileRoute('/weather/sse')({
  component: WeatherSsePage,
})

const DEFAULT_MESSAGE = '北京今天天气怎么样？'

function WeatherSsePage() {
  const [input, setInput] = useState(DEFAULT_MESSAGE)
  const [messages, setMessages] = useState<WeatherChatMessage[]>([])
  const [status, setStatus] = useState<'idle' | 'streaming' | 'done' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const seenIdsRef = useRef(new Set<string>())
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const appendMessages = useCallback((batch: WeatherChatMessage[]) => {
    if (batch.length === 0)
      return
    setMessages(prev => [...prev, ...batch])
  }, [])

  const sendMessage = useCallback(async () => {
    const text = input.trim()
    if (!text)
      return

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    seenIdsRef.current = new Set()
    setError(null)
    setStatus('streaming')

    const userMsg = createUserMessage(text)
    seenIdsRef.current.add(userMsg.id)
    setMessages([userMsg])

    try {
      await streamWeatherGraph({
        message: text,
        signal: controller.signal,
        onMessage: (msg: SseMessage) => {
          if (msg.type === 'update') {
            appendMessages(parseWeatherUpdate(msg.data, seenIdsRef.current))
            return
          }
          if (msg.type === 'error') {
            const errMsg: WeatherChatMessage = {
              id: `error-${Date.now()}`,
              kind: 'error',
              content: msg.message ?? 'unknown error',
            }
            seenIdsRef.current.add(errMsg.id)
            appendMessages([errMsg])
          }
        },
      })
      setStatus('done')
    }
    catch (err) {
      if (controller.signal.aborted)
        return
      const errMsg = err instanceof Error ? err.message : String(err)
      setError(errMsg)
      setStatus('error')
      appendMessages([{
        id: `error-${Date.now()}`,
        kind: 'error',
        content: errMsg,
      }])
    }
  }, [appendMessages, input])

  const stopStream = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setStatus('idle')
  }, [])

  return (
    <main className="mx-auto flex h-[calc(100vh-65px)] max-w-3xl flex-col p-4">
      <div className="mb-3 shrink-0">
        <h1 className="text-xl font-semibold">Weather Agent（SSE）</h1>
        <p className="mt-1 text-sm text-slate-400">
          ReAct 对话 ·
          {' '}
          <code className="rounded bg-slate-800 px-1 py-0.5 text-xs">GET /sample/weather</code>
        </p>
      </div>

      <div className="flex min-h-0 flex-1 flex-col rounded-2xl border border-slate-800 bg-slate-900/50">
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {messages.length === 0 && (
            <p className="py-8 text-center text-sm text-slate-500">
              输入问题并发送，查看 AI 回复与工具调用
            </p>
          )}
          {messages.map(msg => (
            <WeatherChatBubble key={msg.id} message={msg} />
          ))}
          <div ref={bottomRef} />
        </div>

        {error && status === 'error' && (
          <p className="shrink-0 border-t border-slate-800 px-4 py-2 text-sm text-red-400">
            {error}
          </p>
        )}

        <div className="shrink-0 border-t border-slate-800 p-3">
          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.nativeEvent.isComposing && status !== 'streaming')
                  void sendMessage()
              }}
              disabled={status === 'streaming'}
              placeholder="问天气，例如：上海明天天气如何？"
              className="min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 disabled:opacity-50"
            />
            <button
              type="button"
              onClick={() => void sendMessage()}
              disabled={status === 'streaming' || !input.trim()}
              className="rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-medium text-slate-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              发送
            </button>
            {status === 'streaming' && (
              <button
                type="button"
                onClick={stopStream}
                className="rounded-xl border border-slate-600 px-3 py-2.5 text-sm hover:bg-slate-800"
              >
                停止
              </button>
            )}
          </div>
          <p className="mt-2 text-xs text-slate-500">
            状态:
            {' '}
            {status}
            {status === 'streaming' && ' · 等待模型与工具响应…'}
          </p>
        </div>
      </div>
    </main>
  )
}
