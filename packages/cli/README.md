# @agent/cli

终端 ReAct 实验：Ink UI + Effect `agentLoop` + OpenAI driver + MCP / HITL。与 Web Copilot 图定义独立，共用 `@agent/protocol` 与 `@agent/tools`。

## 入口

| 路径 | 说明 |
|------|------|
| `pnpm cli` / `src/cli.ts` | Ink 主入口（Tushare MCP + interact tools） |
| `src/boot.tsx` | UI boot |
| `src/index.ts` | 包入口（流式 demo） |

## 目录

```text
src/
├── cli.ts / boot.tsx
├── agent/          # weather、tushare、interact-tools
├── core/           # agent-loop、driver、mcp、interrupt-protocol
└── ui/             # Ink 三区布局、Markdown、HITL 交互
```

## 快速开始

```bash
# 仓库根目录
cp .env.example .env   # 需 OPENAI_*；Tushare 需 TUSHARE_TOKEN
pnpm cli
# 或
pnpm --filter @agent/cli start
```

不经 server / Copilot；会话在进程内，无 checkpoint 持久化。

## 常用命令

```bash
pnpm cli
pnpm --filter @agent/cli start
pnpm --filter @agent/cli tc
```

## 相关文档

- 仓库根 [README](../../README.md)
- [wiki/CLI-交互实现.md](../../wiki/CLI-交互实现.md) — 主文档
- [wiki/ReAct.md](../../wiki/ReAct.md) — CLI `agentLoop` vs LangGraph
- [packages/protocol/README.md](../protocol/README.md)
- [packages/tools/README.md](../tools/README.md)
