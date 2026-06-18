import { Box, Static, Text } from 'ink'
import React, { memo } from 'react'
import { Markdown, StreamingMarkdown } from './markdown'

export { Markdown, StreamingMarkdown } from './markdown'

export interface FinishedMessage {
  id: number
  content: string
}

const FinishedMessageItem = memo(({ content }: { content: string }) => (
  <Box flexDirection="column">
    <Markdown>{content}</Markdown>
    <Text>{' '}</Text>
  </Box>
))

export function StreamingConversation({
  finished,
  streaming,
}: {
  finished: FinishedMessage[]
  streaming: string
}) {
  return (
    <Box flexDirection="column">
      {/* 已完成：渲染一次后冻结进 scrollback */}
      <Static items={finished}>
        {msg => <FinishedMessageItem key={msg.id} content={msg.content} />}
      </Static>

      {/* 进行中：高频更新区，受 useDeferredValue + 稳定前缀边界保护 */}
      {streaming !== '' && (
        <Box flexDirection="column">
          <StreamingMarkdown>{streaming}</StreamingMarkdown>
          <Text color="cyan">▌</Text>
        </Box>
      )}
    </Box>
  )
}
