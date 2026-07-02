/**
 * MCP 客户端已抽到 `@agent/tools` 共享（graph 与 cli 复用）。
 * 此文件保留 `@core/mcp/client` 路径以兼容 cli 现有 import，仅做 re-export。
 */
export {
  createTushareMcp,
  type McpTool,
  TOKEN_HINT,
  type TushareMcp,
} from '@agent/tools'
