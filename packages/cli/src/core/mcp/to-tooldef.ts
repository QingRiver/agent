import type { TushareMcp } from '@core/mcp/client'
import type { ToolDef } from '@core/types'
import { Effect } from 'effect'

function toolErrorMessage(err: unknown): string {
  if (err instanceof Error)
    return err.message
  return String(err)
}

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
