import type { GraphsName } from '@apis/api-types'
import type { RemoteThreadListAdapter } from '@assistant-ui/react'
import type { LangChainMessage, LangGraphInterruptState } from '@assistant-ui/react-langgraph'
import type { ReactNode } from 'react'
import { fetchGraphLangGraphState, streamGraphLangGraph } from '@apis/graph-langgraph-sse'
import { AssistantRuntimeProvider } from '@assistant-ui/react'
import { useLangGraphRuntime } from '@assistant-ui/react-langgraph'
import { useEffect, useMemo, useRef } from 'react'

function useGraphThreadListAdapter(threadId: string, title: string): RemoteThreadListAdapter {
  return useMemo(() => {
    const metadata = {
      status: 'regular' as const,
      remoteId: threadId,
      externalId: threadId,
      title,
    }
    return {
      async list() {
        return { threads: [metadata] }
      },
      async fetch() {
        return metadata
      },
      async initialize() {
        return { remoteId: threadId, externalId: threadId }
      },
      async rename() {},
      async archive() {},
      async unarchive() {},
      async delete() {},
      async generateTitle() {
        return new ReadableStream({
          start(controller) {
            controller.close()
          },
        })
      },
    }
  }, [threadId, title])
}

export interface AssistantGraphRuntimeProps {
  graph: GraphsName
  threadId: string
  children: ReactNode
  /** 发送前改写消息。返回 null 则中止本次运行。 */
  prepareMessages?: (messages: readonly { type?: string, content?: unknown }[]) => readonly { type?: string, content?: unknown }[] | null
  configurable?: () => Record<string, unknown> | undefined
  onCustom?: (data: unknown) => void
  onRunningChange?: (running: boolean) => void
}

function AssistantGraphRuntimeInner({
  graph,
  threadId,
  children,
  prepareMessages,
  configurable,
  onCustom,
  onRunningChange,
}: AssistantGraphRuntimeProps) {
  const prepareRef = useRef(prepareMessages)
  const configRef = useRef(configurable)
  const customRef = useRef(onCustom)
  const runningRef = useRef(onRunningChange)
  useEffect(() => {
    prepareRef.current = prepareMessages
    configRef.current = configurable
    customRef.current = onCustom
    runningRef.current = onRunningChange
  }, [prepareMessages, configurable, onCustom, onRunningChange])

  const threadListAdapter = useGraphThreadListAdapter(threadId, graph)
  const runtime = useLangGraphRuntime({
    threadId,
    unstable_threadListAdapter: threadListAdapter,
    create: async () => ({ externalId: threadId }),
    load: async (id) => {
      const state = await fetchGraphLangGraphState(graph, id)
      return {
        messages: state.messages,
        interrupts: state.interrupts as LangGraphInterruptState[],
      }
    },
    async stream(messages, config) {
      const prepared = prepareRef.current
        ? prepareRef.current(messages as readonly { type?: string, content?: unknown }[])
        : messages
      if (prepared == null)
        throw new Error('消息未发送')
      const { externalId } = await config.initialize()
      if (!externalId)
        throw new Error('assistant thread 未初始化')
      return streamGraphLangGraph({
        graph,
        threadId: externalId,
        messages: prepared as readonly LangChainMessage[],
        command: config.command,
        configurable: configRef.current?.(),
        onCustom: data => customRef.current?.(data),
        onRunning: running => runningRef.current?.(running),
        signal: config.abortSignal,
      })
    },
  })

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      {children}
    </AssistantRuntimeProvider>
  )
}

export function AssistantGraphRuntime({
  graph,
  threadId,
  children,
  prepareMessages,
  configurable,
  onCustom,
  onRunningChange,
}: AssistantGraphRuntimeProps) {
  return (
    <AssistantGraphRuntimeInner
      key={`${graph}:${threadId}`}
      graph={graph}
      threadId={threadId}
      prepareMessages={prepareMessages}
      configurable={configurable}
      onCustom={onCustom}
      onRunningChange={onRunningChange}
    >
      {children}
    </AssistantGraphRuntimeInner>
  )
}
