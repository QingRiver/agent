# @agent/graph

LangGraph Agent 图定义与 AG-UI 流式映射。Web / Copilot 侧可运行图在此注册；`AguiTransformer` 将 LangGraph `streamEvents(v3)` 转为 AG-UI 事件。

## 导出概览

| 导出 | 说明 |
|------|------|
| `Graphs` / `GraphsName` | 可运行图注册表与名称类型 |
| `AguiTransformer` / `aguiTransformerFactory` | ProtocolEvent → AG-UI |
| `kbGraph` / `writerGraph` 等 | 各图及扩展事件名（引文、修订摘要等） |
| HITL `ASK_*` | 人在回路 ask 工具与系统提示 |

当前 `Graphs` 键：`claudeAgent`、`simpleToolCall`、`weather`、`hitl`、`kb`、`tushare`、`writer`。

## 目录

```text
src/
├── *Graph.ts              # 各 Agent 图
├── stream/                # AguiTransformer 与 map*ToAgUi
├── hitl/ask-tools.ts      # HITL ask 工具
├── mcp/mcpToLangchain.ts  # MCP → LangChain tool
└── index.ts               # Graphs + 公共导出
```

## 使用

Server 在 `apps/server/src/agent/graphAgents.ts` 编译图并接入 CopilotRuntime；Client 通常只引用 `GraphsName` 类型，避免把整个图打进浏览器。

```ts
import { Graphs, type GraphsName, AguiTransformer } from '@agent/graph'
```

依赖：`@agent/kb`、`@agent/tools`、`@agent/protocol`、`@agent/claude-agent`、`@agent/env`。

## 常用命令

```bash
pnpm --filter @agent/graph tc
# 仓库根目录
pnpm test    # 覆盖本包 *.test.ts
```

## 相关文档

- 仓库根 [README](../../README.md)
- [wiki/ReAct.md](../../wiki/ReAct.md) — weather / tushare
- [wiki/RAG.md](../../wiki/RAG.md) — `kbGraph`
- [wiki/LangGraph-AGUI-事件映射.md](../../wiki/LangGraph-AGUI-事件映射.md) — `AguiTransformer`
- [wiki/LangGraph-AGUI-人在回路.md](../../wiki/LangGraph-AGUI-人在回路.md) — `hitl` + interrupt
- [wiki/文本编辑器.md](../../wiki/文本编辑器.md) — writer
