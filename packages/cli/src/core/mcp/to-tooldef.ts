import type { TushareMcp } from '@core/mcp/client'
import type { ToolDef } from '@core/types'
import { toolErrorMessage } from '@agent/tools'
import { Effect } from 'effect'

function mcpToolsToToolDefs(mcp: TushareMcp): ToolDef[] {
  return mcp.tools.map((tool) => {
    const { name, description, inputSchema } = tool
    return {
      schema: {
        type: 'function',
        function: {
          name,
          description: description ?? `Tushare MCP 工具: ${name}`,
          parameters: inputSchema,
        },
      },
      risk: 'safe' as const,
      execute: (args: Record<string, unknown>) =>
        Effect.promise(() => mcp.callTool(name, args)).pipe(
          Effect.match({
            onFailure: err => toolErrorMessage(err),
            onSuccess: text => text,
          }),
        ),
    }
  })
}

export { mcpToolsToToolDefs }
