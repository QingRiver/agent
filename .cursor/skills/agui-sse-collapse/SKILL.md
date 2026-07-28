---
name: agui-sse-collapse
description: >-
  Collapse AG-UI / CopilotKit text/event-stream dumps by folding
  TEXT_MESSAGE_CONTENT and REASONING_MESSAGE_CONTENT deltas into one CONTENT
  per messageId (order preserved). Use when the user shares SSE debug captures,
  network event-stream logs, or asks to merge/fold/collapse AG-UI streaming
  deltas to save tokens before analysis.
---

# AG-UI SSE collapse（省 token）

分析 AG-UI / CopilotKit 的 `text/event-stream` 调试转储时，**先折叠再阅读**，不要把原始逐 token `delta` 整段塞进上下文。

## 何时用

- 用户丢来 SSE / `data: {...}` 调试文件（如 `debug.data`）
- 需要看完整助手正文 / reasoning，但不需要逐字 delta
- 排查脚注、工具调用、中断等，且原始流事件量很大

## 怎么跑

在仓库根目录（Node，无额外依赖）：

```bash
node .cursor/skills/agui-sse-collapse/scripts/collapse-agui-sse.mjs <dump-path> -f summary
```

写到文件：

```bash
node .cursor/skills/agui-sse-collapse/scripts/collapse-agui-sse.mjs <dump-path> -f summary -o /tmp/agui-collapsed.md
```

| `-f` | 用途 |
|------|------|
| `summary`（默认） | Markdown：统计 + 按时序的收拢消息（**给 agent 读**） |
| `sse` | 仍是 `data: {...}`，但 CONTENT 已合并 |
| `jsonl` | 一行一个 JSON 事件 |

stdin：

```bash
pbpaste | node .cursor/skills/agui-sse-collapse/scripts/collapse-agui-sse.mjs -f summary
```

## 折叠规则

1. **只折叠** `TEXT_MESSAGE_CONTENT`、`REASONING_MESSAGE_CONTENT` 的 `delta`。
2. 同一 `messageId` 的多个 delta → **一条** CONTENT（`delta` = 拼接全文）。
3. `*_START` 留在原时序位置；合并后的 CONTENT（+ `*_END`）出现在原 `*_END` 处（无 END 则在流末尾刷新）。
4. `RUN_*` / `TOOL_CALL_*` / `CUSTOM` / 其它事件 **原样保留、时序不变**。
5. `RUN_STARTED.input` 在 `summary` 里会截断，只保留 thread/run 与 user messages，避免整份 prompt 占 token。

## Agent 工作流

1. 拿到 dump 路径或粘贴内容后，**立刻**跑上面的脚本（优先 `-f summary`）。
2. **只读折叠结果**做分析；不要 `Read` 未折叠的整份 SSE。
3. 若需对照原始某类非 delta 事件，再用 `-f sse` 出折叠流，而不是回原始 dump。

## 依赖

Node.js（`node:fs` / `node:util.parseArgs`）；无 npm 包。
