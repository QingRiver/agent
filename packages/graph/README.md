# @agent/graph

LangGraph Agent 图定义与 AG-UI 流式映射。Web / Copilot 侧可运行图在此注册；`AguiTransformer` 将 LangGraph `streamEvents(v3)` 转为 AG-UI 事件。

## 导出概览

| 导出 | 说明 |
|------|------|
| `Graphs` / `GraphsName` | 可运行图注册表与名称类型 |
| `AguiTransformer` / `aguiTransformerFactory` | ProtocolEvent → AG-UI |
| `devGraph` / `kbGraph` / `writerGraph` 等 | 各图及扩展事件名 |
| `ASK_*` | 人在回路 ask 工具与系统提示（内部走 `hitl*` helpers） |

当前 `Graphs` 键：`claudeAgent`、`dev`、`kb`、`tushare`、`writer`、`editorChat`。

## 目录

```text
src/
├── graphs/                 # 薄装配（dev / kb / tushare / writer / editorChat / claudeAgent）
├── nodes/
│   ├── writeEdit.ts        # makeWriteEditNode + runWriteEdit
│   ├── chatCompletion.ts   # runChatCompletion(silent|streamReasoning)
│   ├── classifyEditorIntent.ts
│   └── chatbot.ts
├── edges/
├── tools/
│   ├── ask-tools.ts        # ask_* LC tools
│   ├── hitl/interrupt.ts   # 平台 hitlInput/Select/…（与 InterruptCard 同协议）
│   ├── tushare/            # resolveStock、toolset、flash fix
│   ├── weather.ts
│   └── order.ts
├── prompts/                # editorPrompts 等
├── state/
├── stream/
└── index.ts
```

Interrupt：业务代码应调用 `hitl*`，勿直接 `interrupt({ type })`。Client 侧任意 agent 用 `AgentInterruptUi`（见 `apps/client/src/components/hitl/`）。

相关：[wiki/Graph包积木化重组计划.md](../../wiki/Graph包积木化重组计划.md)、[wiki/HITL通用化与tushare拆分计划.md](../../wiki/HITL通用化与tushare拆分计划.md)。

## 使用

```ts
import { Graphs, type GraphsName, AguiTransformer } from '@agent/graph'
```

依赖：`@agent/kb`、`@agent/tools`、`@agent/protocol`、`@agent/claude-agent`、`@agent/env`。

## 常用命令

```bash
pnpm --filter @agent/graph tc
pnpm test    # 覆盖本包 *.test.ts
```
