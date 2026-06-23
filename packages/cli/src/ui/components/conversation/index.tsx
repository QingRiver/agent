import type { UIMessage } from '@core/types'
import type { ReactNode } from 'react'
import { ToolResultLine, UserMessage } from '@ui/components/line'
import { Markdown, StreamingMarkdown } from '@ui/components/markdown'

import { useHighlight } from '@ui/hooks/use-highlight'
import { Box, Static, Text } from 'ink'
import { memo } from 'react'

/** UI 历史消息:与 UIMessage 同构,仅多 id 供 React key / Static 冻结 */
export type HistoryMessage = UIMessage & { id: number }

const AssistantMessageItem = memo(({ content, highlight }: { content: string, highlight: ReturnType<typeof useHighlight> }) => (
  <Box flexDirection="column">
    <Markdown highlight={highlight}>{content}</Markdown>
    <Text>{' '}</Text>
  </Box>
))

function HistoryMessageItem({ msg, highlight }: { msg: HistoryMessage, highlight: ReturnType<typeof useHighlight> }) {
  switch (msg.kind) {
    case 'user':
      return <UserMessage content={msg.content} />
    case 'assistant':
      return <AssistantMessageItem content={msg.content} highlight={highlight} />
    case 'toolResult':
      return <ToolResultLine name={msg.name} result={msg.result} />
  }
}

export function Conversation({
  messages,
  streaming,
  pending,
}: {
  messages: HistoryMessage[]
  streaming: string
  pending?: ReactNode | null
}) {
  const highlight = useHighlight()

  return (
    <Box flexDirection="column">
      <Static items={messages}>
        {msg => <HistoryMessageItem key={msg.id} msg={msg} highlight={highlight} />}
      </Static>

      {streaming !== '' && (
        <Box flexDirection="column">
          <StreamingMarkdown highlight={highlight}>{streaming}</StreamingMarkdown>
          <Text color="cyan">▌</Text>
        </Box>
      )}

      {pending}
    </Box>
  )
}
