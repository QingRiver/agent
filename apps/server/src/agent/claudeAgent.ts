import type { RunAgentInput } from '@ag-ui/core'
import type { Options } from '@agent/claude-agent'
import { claudePackageQueryOptions } from '@agent/claude-agent'
import { extractLastUserMessage } from './extractLastUserMessage'
import { GraphTransformerAguiAgent } from './graphTransformerAguiAgent'
import { streamClaudeAgentAguiEvents } from './streamClaudeAgentAguiEvents'

function buildSdkOptions(): Options {
  return claudePackageQueryOptions()
}

function streamClaudeEvents(input: RunAgentInput) {
  const prompt = extractLastUserMessage(input, {
    defaultMessage: '你好，请简要介绍这个仓库的结构。',
  })
  return streamClaudeAgentAguiEvents(input, {
    prompt,
    sdkOptions: buildSdkOptions(),
  })
}

export const claudeAgent = new GraphTransformerAguiAgent(
  { agentId: 'claudeAgent', description: 'Claude Agent SDK + AG-UI（assistant 文本与 tool_use）' },
  streamClaudeEvents,
)
