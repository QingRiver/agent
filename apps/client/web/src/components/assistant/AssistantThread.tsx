import type { ToolCallMessagePartProps } from '@assistant-ui/react'
import type { ReactNode } from 'react'
import { WEATHER_CURRENT_TOOL_NAME } from '@agent/ui'
import {
  ComposerPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
} from '@assistant-ui/react'
import { useLangGraphInterruptState } from '@assistant-ui/react-langgraph'
import { MarkdownTextPrimitive } from '@assistant-ui/react-markdown'
import { narrowLangGraphInterrupt } from '@lib/langgraphInterrupt'
import { use } from 'react'
import { HideAssistantTextContext } from './assistantContexts'
import { DevInterruptUi } from './DevInterruptUi'
import { WeatherCurrentToolRender } from './WeatherCurrentTool'

function isHiddenAssistant(
  message: { role: string, content: readonly { type: string, text?: string }[] },
  hideText?: (text: string) => boolean,
) {
  if (message.role !== 'assistant' || hideText == null)
    return false
  return !message.content.some((part) => {
    if (part.type === 'text')
      return !hideText(part.text ?? '')
    return part.type === 'reasoning' || part.type === 'tool-call'
  })
}

function MarkdownText({ text }: { text: string }) {
  const hideText = use(HideAssistantTextContext)
  if (!text || hideText?.(text))
    return null
  return (
    <MarkdownTextPrimitive className="prose prose-sm max-w-none dark:prose-invert" />
  )
}

function ReasoningPart({ text }: { text: string }) {
  if (!text.trim())
    return null
  return (
    <details open className="mb-2 text-xs text-muted-foreground">
      <summary className="cursor-pointer select-none">思考</summary>
      <p className="mt-1 whitespace-pre-wrap">{text}</p>
    </details>
  )
}

function ToolCallFallback({
  toolName,
  argsText,
  result,
  status,
}: ToolCallMessagePartProps) {
  const args = argsText.trim() && argsText.trim() !== '{}' ? argsText : ''
  const output = status.type !== 'running' && result != null
    ? (typeof result === 'string' ? result : JSON.stringify(result))
    : ''
  return (
    <div className="mb-2 rounded-md border border-border bg-background px-2 py-1.5 text-xs">
      <div className="font-medium text-foreground">{toolName}</div>
      {args !== '' && (
        <pre className="mt-1 whitespace-pre-wrap text-muted-foreground">{args}</pre>
      )}
      {output !== '' && (
        <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap text-muted-foreground">{output}</pre>
      )}
    </div>
  )
}

export interface AssistantThreadProps {
  placeholder?: string
  emptyHint?: string
  blocked?: boolean
  blockInputHint?: string
  hideAssistantText?: (text: string) => boolean
  interrupt?: ReactNode
}

export function AssistantThread({
  placeholder = '输入消息…',
  emptyHint = '发一条消息开始。',
  blocked = false,
  blockInputHint = '请先完成上方确认',
  hideAssistantText,
  interrupt,
}: AssistantThreadProps) {
  const inputBlocked = blocked
  return (
    <HideAssistantTextContext value={hideAssistantText}>
      <ThreadPrimitive.Root className="flex h-full min-h-0 flex-col bg-background">
        <ThreadPrimitive.Viewport className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
          <ThreadPrimitive.Empty>
            <p className="text-sm text-muted-foreground">{emptyHint}</p>
          </ThreadPrimitive.Empty>
          <ThreadPrimitive.Messages>
            {({ message }) => {
              if (isHiddenAssistant(message, hideAssistantText))
                return null
              return (
                <MessagePrimitive.Root
                  className={
                    message.role === 'user'
                      ? 'ml-auto max-w-[85%] rounded-2xl bg-primary px-3 py-2 text-sm text-primary-foreground'
                      : 'max-w-[85%] rounded-2xl bg-muted px-3 py-2 text-sm text-foreground'
                  }
                >
                  <MessagePrimitive.Parts
                    components={{
                      Text: MarkdownText,
                      Reasoning: ReasoningPart,
                      tools: {
                        by_name: {
                          [WEATHER_CURRENT_TOOL_NAME]: WeatherCurrentToolRender,
                        },
                        Fallback: ToolCallFallback,
                      },
                    }}
                  />
                  {message.status?.type === 'incomplete' && (
                    <p className="mt-1 text-xs text-destructive">
                      {typeof message.status.error === 'string' ? message.status.error : '生成没有完成'}
                    </p>
                  )}
                </MessagePrimitive.Root>
              )
            }}
          </ThreadPrimitive.Messages>
        </ThreadPrimitive.Viewport>
        {interrupt}
        <ComposerPrimitive.Root className="flex items-end gap-2 border-t border-border p-3">
          <ComposerPrimitive.Input
            disabled={inputBlocked}
            placeholder={inputBlocked ? blockInputHint : placeholder}
            className="max-h-40 min-h-10 flex-1 resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground disabled:opacity-60"
          />
          <ComposerPrimitive.Send
            className="h-9 rounded-md bg-primary px-3 text-sm text-primary-foreground disabled:opacity-50"
          >
            发送
          </ComposerPrimitive.Send>
        </ComposerPrimitive.Root>
      </ThreadPrimitive.Root>
    </HideAssistantTextContext>
  )
}

/** LangGraph runtime 里的线程：中断卡片和输入锁定走助手运行时自己的 interrupt。 */
export function AssistantLangGraphThread(props: Omit<AssistantThreadProps, 'blocked' | 'interrupt'> & {
  blocked?: boolean
}) {
  const pending = narrowLangGraphInterrupt(useLangGraphInterruptState()) != null
  return (
    <AssistantThread
      {...props}
      blocked={props.blocked || pending}
      interrupt={(
        <div className="px-4 pb-2">
          <DevInterruptUi />
        </div>
      )}
    />
  )
}
