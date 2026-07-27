# Graphs

> 由 `pnpm --filter @agent/graph graphs:md` 自动生成（`compile().getGraph().drawMermaid()`）。
> 请勿手改；改图后重新跑命令。

## `claudeAgentGraph`

来源：`src/graphs/claudeAgent.ts`

```mermaid
%%{init: {'flowchart': {'curve': 'linear'}}}%%
graph TD
	__start__([__start__]):::first
	claude_agent(claude_agent)
	__end__([__end__]):::last
	__start__ --> claude_agent;
	claude_agent --> __end__;
	classDef default fill:#f2f0ff,line-height:1.2;
	classDef first fill-opacity:0;
	classDef last fill:#bfb6fc;
```

## `devGraph`

来源：`src/graphs/dev.ts`

```mermaid
%%{init: {'flowchart': {'curve': 'linear'}}}%%
graph TD
	__start__([__start__]):::first
	clarify(clarify)
	agent_weather(agent_weather)
	tools_weather(tools_weather)
	agent_order(agent_order)
	tools_order(tools_order)
	agent_kb(agent_kb)
	tools_kb(tools_kb)
	collect_hitl(collect_hitl)
	execute_hitl(execute_hitl)
	__end__([__end__]):::last
	__start__ --> clarify;
	collect_hitl --> execute_hitl;
	execute_hitl --> __end__;
	tools_kb --> agent_kb;
	tools_order --> agent_order;
	tools_weather --> agent_weather;
	clarify -.-> agent_weather;
	clarify -.-> agent_order;
	clarify -.-> agent_kb;
	clarify -.-> collect_hitl;
	agent_weather -.-> tools_weather;
	agent_weather -.-> __end__;
	agent_order -.-> tools_order;
	agent_order -.-> __end__;
	agent_kb -.-> tools_kb;
	agent_kb -.-> __end__;
	classDef default fill:#f2f0ff,line-height:1.2;
	classDef first fill-opacity:0;
	classDef last fill:#bfb6fc;
```

## `editorChatGraph`

来源：`src/graphs/editorChat.ts`

```mermaid
%%{init: {'flowchart': {'curve': 'linear'}}}%%
graph TD
	__start__([__start__]):::first
	classifyIntent(classifyIntent)
	chatbot(chatbot)
	writeEdit(writeEdit)
	__end__([__end__]):::last
	__start__ --> classifyIntent;
	chatbot --> __end__;
	writeEdit --> __end__;
	classifyIntent -.-> chatbot;
	classifyIntent -.-> writeEdit;
	classDef default fill:#f2f0ff,line-height:1.2;
	classDef first fill-opacity:0;
	classDef last fill:#bfb6fc;
```

## `kbGraph`

来源：`src/graphs/kb.ts`

```mermaid
%%{init: {'flowchart': {'curve': 'linear'}}}%%
graph TD
	__start__([__start__]):::first
	rewrite(rewrite)
	retrieve(retrieve)
	generate(generate)
	__end__([__end__]):::last
	__start__ --> rewrite;
	rewrite --> retrieve;
	retrieve -.-> rewrite;
	retrieve -.-> generate;
	retrieve -.-> __end__;
	generate -.-> rewrite;
	generate -.-> retrieve;
	generate -.-> __end__;
	classDef default fill:#f2f0ff,line-height:1.2;
	classDef first fill-opacity:0;
	classDef last fill:#bfb6fc;
```

## `tushareGraph`

来源：`src/graphs/tushare.ts`

```mermaid
%%{init: {'flowchart': {'curve': 'linear'}}}%%
graph TD
	__start__([__start__]):::first
	agent(agent)
	tools(tools)
	__end__([__end__]):::last
	__start__ --> agent;
	tools --> agent;
	agent -.-> tools;
	agent -.-> __end__;
	classDef default fill:#f2f0ff,line-height:1.2;
	classDef first fill-opacity:0;
	classDef last fill:#bfb6fc;
```

## `writerGraph`

来源：`src/graphs/writer.ts`

```mermaid
%%{init: {'flowchart': {'curve': 'linear'}}}%%
graph TD
	__start__([__start__]):::first
	writeEdit(writeEdit)
	__end__([__end__]):::last
	__start__ --> writeEdit;
	writeEdit --> __end__;
	classDef default fill:#f2f0ff,line-height:1.2;
	classDef first fill-opacity:0;
	classDef last fill:#bfb6fc;
```

