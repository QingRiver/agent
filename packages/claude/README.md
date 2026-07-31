# @agent/claude

Anthropic Claude Agent SDK 适配：跑 query、转 LangChain / AG-UI，并嵌入 LangGraph 节点（`claudeAgent` 图）。

## 导出概览

| 模块 | 典型导出 |
|------|----------|
| 运行 | `runClaudeAgent`、SDK `query` / 类型 |
| LangGraph | `runQueryInGraphNode`、`AGUI_WRITER_EVENT` |
| AG-UI | `streamClaudeSdkToAgUi`、`mapSdkMessageToAgUi` |
| LangChain | `sdkAssistantToAIMessage`、`makeMessageChunkFromAnthropicEvent` |
| 配置 | `claudePackageQueryOptions`、`readOnlyOptions`、`READ_ONLY_TOOLS` |

## 目录

```text
src/
├── runClaudeAgent.ts
├── sdk.ts / config.ts / presets.ts
├── agui/          # SDK → AG-UI
├── langchain/     # SDK → LangChain message / chunk
├── langgraph/     # 图节点内跑 query
└── demo.ts        # 本地演示入口
```

## 使用

```ts
import { runQueryInGraphNode } from '@agent/claude'
```

由图 `@agent/graph` 的 `claudeAgentGraph` 调用；需根 `.env` 中配置 `ANTHROPIC_*`。

## 常用命令

```bash
pnpm --filter @agent/claude tc
pnpm --filter @agent/claude demo   # tsx src/demo.ts
```

## 相关文档

- 仓库根 [README](../../README.md)
- [packages/graph/README.md](../graph/README.md) — `claudeAgent` 图
- [apps/server/README.md](../../apps/server/README.md) — Agent 注册
