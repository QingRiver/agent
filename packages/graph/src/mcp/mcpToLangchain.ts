/**
 * MCP 工具 → LangChain StructuredTool 适配器（graph 侧）。
 *
 * MCP `inputSchema` 本身就是 JSON Schema，直接作为 `DynamicStructuredTool.schema`
 * 传入（langchain 1.2+ 的 schema 接受 JsonSchema7Type，bindTools 时原样转 OpenAI function）。
 * 与 cli 的 `mcpToolsToToolDefs`（effect ToolDef）对应，但产出 langchain 工具供 ToolNode 调度。
 */
import type { McpTool, TushareMcp } from '@agent/tools'
import { DynamicStructuredTool } from '@langchain/core/tools'

function toolErrorMessage(err: unknown): string {
  if (err instanceof Error)
    return err.message
  return String(err)
}

/** 单个 MCP 工具 → DynamicStructuredTool（错误消化为字符串，避免 ToolNode 抛出中断流） */
export function mcpToolToLangchainTool(
  tool: McpTool,
  callTool: TushareMcp['callTool'],
): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: tool.name,
    description: tool.description ?? `Tushare MCP 工具: ${tool.name}`,
    schema: tool.inputSchema,
    func: async (input) => {
      try {
        return await callTool(tool.name, input as Record<string, unknown>)
      }
      catch (err) {
        return toolErrorMessage(err)
      }
    },
  })
}

/** 全量 MCP 工具 → LangChain 工具数组 */
export function mcpToolsToLangchainTools(mcp: TushareMcp): DynamicStructuredTool[] {
  return mcp.tools.map(tool => mcpToolToLangchainTool(tool, mcp.callTool))
}
