/**
 * useConversation —— React state 持有 + 装配 Live Layer + 跑 Effect
 *
 * 调度逻辑(agentLoop Effect)在 agent-loop.ts,requirement 经 R channel 声明。
 * 本 hook 只负责:
 *  - 持有 React state(messages / streaming / spinnerLabel / interaction)+ driver
 *  - 装配 Live Layer(Driver + UI),UI 实现闭包 React setter
 *  - runTurn:Effect.runPromise + Effect.provide(LiveLayer)
 *  - 队列排空 + single-flight(streamingRef 守卫)
 *  - HITL 挂起/恢复:UI.interact 用 Effect.async 挂起,resume 回调存 resolveRef;respond 触发 resume
 *
 * 关键:UI.streaming.append → setBuffer(urgent),不用 useDeferredValue,保流式实时。
 */

import type { InteractionRequest, InteractionResponse, UIMessage } from '@core/types'
import type { HistoryMessage } from '@ui/components/conversation'
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions/completions'
import { randomUUID } from 'node:crypto'
import { agentLoop } from '@core/agent-loop'
import { Driver, UI } from '@core/types'
import { useConversationConfig } from '@ui/components/provider/conversation-config'
import { useStreamingBuffer } from '@ui/hooks/use-streaming-buffer'
import { Effect, Layer } from 'effect'
import { useCallback, useMemo, useRef, useState } from 'react'

export interface Conversation {
  messages: HistoryMessage[]
  streaming: string
  reasoning: string
  isStreaming: boolean
  spinnerLabel: string | null
  interaction: InteractionRequest | null
  send: (text: string) => void
  /**
   * 响应当前挂起的中断。调用方只需提供 `{ type, payload }`,
   * interruptId 由 hook 内部按当前挂起中断补全并校验(对 UI 透明)。
   */
  respond: (response: Omit<InteractionResponse, 'interruptId'>) => void
}

export function useConversation(): Conversation {
  const { driver, tools, systemPrompt } = useConversationConfig()
  const [messages, setMessages] = useState<HistoryMessage[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [spinnerLabel, setSpinnerLabel] = useState<string | null>(null)
  const [interaction, setInteraction] = useState<InteractionRequest | null>(null)
  const {
    buffer,
    append,
    commit,
    reset,
  } = useStreamingBuffer()
  const {
    buffer: reasoningBuffer,
    append: appendReasoning,
    commit: commitReasoning,
    reset: resetReasoning,
  } = useStreamingBuffer()

  // LLM 真实历史(含 system),由 agentLoop 直接 mutate
  const llmMessagesRef = useRef<ChatCompletionMessageParam[]>([
    { role: 'system', content: systemPrompt },
  ])
  const toolsRef = useRef(tools)
  toolsRef.current = tools
  const idRef = useRef(0)
  const streamingRef = useRef(false)
  const pendingQueueRef = useRef<string[]>([])
  const resolveRef = useRef<((r: InteractionResponse) => void) | null>(null)
  // 当前挂起中断的 id(与响应路由匹配用)。挂起时生成,respond 校验一致才 resume,
  // 防止过期/错配响应误触发恢复。本期不做持久化:进程内 id 即足够路由中断恢复过程。
  const pendingInterruptIdRef = useRef<string | null>(null)

  const respond = useCallback((response: Omit<InteractionResponse, 'interruptId'>) => {
    // interruptId 由内部按当前挂起中断补全;无挂起中断则忽略(防止过期响应)
    const interruptId = pendingInterruptIdRef.current
    if (interruptId == null)
      return
    const full: InteractionResponse = { interruptId, ...response }
    resolveRef.current?.(full)
    resolveRef.current = null
    pendingInterruptIdRef.current = null
    setInteraction(null)
  }, [])

  // Live Layer:Driver(外部后端)+ UI(所有 React 面向副作用)
  const liveLayer = useMemo(
    () =>
      Layer.mergeAll(
        Layer.succeed(Driver, driver),
        Layer.succeed(UI, {
          pushHistory: (entry: UIMessage) =>
            setMessages(prev => [...prev, { id: idRef.current++, ...entry }]),
          streaming: { reset, append, commit },
          reasoning: { reset: resetReasoning, append: appendReasoning, commit: commitReasoning },
          // Effect.async 挂起直到 respond 调用 resume(无 Deferred 的 Scope 包袱,语义等价)
          // 生成 interruptId 标识本次挂起,响应须带相同 id 才被 accept(见 respond)
          interact: (request: InteractionRequest) =>
            Effect.async<InteractionResponse>((resume) => {
              const interruptId = randomUUID()
              pendingInterruptIdRef.current = interruptId
              resolveRef.current = resp => resume(Effect.succeed(resp))
              setInteraction(request)
            }),
          setSpinner: (label: string | null) => setSpinnerLabel(label),
        }),
      ),
    [append, appendReasoning, commit, commitReasoning, driver, reset, resetReasoning],
  )

  const runChat = useCallback(async (initialText: string) => {
    streamingRef.current = true
    setIsStreaming(true)

    let text: string | undefined = initialText
    while (text !== undefined) {
      await Effect.runPromise(
        agentLoop(text, toolsRef.current, llmMessagesRef.current).pipe(Effect.provide(liveLayer)),
      )
      text = pendingQueueRef.current.shift()
    }

    streamingRef.current = false
    setIsStreaming(false)
  }, [liveLayer])

  const send = useCallback((text: string) => {
    const trimmed = text.trim()
    if (!trimmed)
      return
    if (streamingRef.current) {
      pendingQueueRef.current.push(trimmed)
      return
    }
    void runChat(trimmed)
  }, [runChat])

  return {
    messages,
    streaming: buffer,
    reasoning: reasoningBuffer,
    isStreaming,
    spinnerLabel,
    interaction,
    send,
    respond,
  }
}
