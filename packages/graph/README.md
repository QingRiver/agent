# @agent/graph

LangGraph Agent 图定义。Web 通过 gateway 的 `/graphs/:name/stream` 直接跑这些图。

## 导出概览

| 导出 | 说明 |
|------|------|
| `Graphs` / `GraphsName` | 可运行图注册表与名称类型 |
| `devGraph` / `kbGraph` / `editorGraph` 等 | 各图及扩展事件名 |
| `ASK_*` | 人在回路 ask 工具与系统提示（内部走 `hitl*` helpers） |

当前 `Graphs` 键：`reactAgent`、`dev`、`kb`、`tushare`、`ha`、`editor`。

## 目录

```text
src/
├── graphs/                 # 薄装配（dev / kb / tushare / ha / editor / reactAgent）
├── nodes/
│   ├── writeEdit.ts        # makeWriteEditNode + runWriteEdit
│   ├── chatCompletion.ts   # runChatCompletion(silent|streamReasoning)
│   ├── classifyEditorIntent.ts
│   └── chatbot.ts
├── edges/
├── tools/
│   ├── ask-tools.ts        # ask_* LC tools
│   ├── hitl/interrupt.ts   # 平台 hitlInput/Select/…（与 @agent/ui InterruptCard 同协议）
│   ├── tushare/            # resolveStock、toolset、flash fix
│   ├── ha/                 # Home Assistant MCP toolset
│   ├── weather.ts
│   └── order.ts
├── prompts/                # editorPrompts 等
├── state/
├── stream/
└── index.ts
```

Interrupt：业务代码应调用 `hitl*`，勿直接 `interrupt({ type })`。Client 侧任意 agent 用 `AgentInterruptUi`（卡片 View：`@agent/ui`）。

## 使用

```ts
import { Graphs, type GraphsName } from '@agent/graph'
```

依赖：`@agent/kb`、`@agent/tools`、`@agent/proto`、`@agent/env`。

## 常用命令

```bash
pnpm --filter @agent/graph tc
pnpm --filter @agent/graph graphs:md   # compile 各图 → 根目录 GRAPHS.md（Mermaid）
pnpm test    # 覆盖本包 *.test.ts
```
