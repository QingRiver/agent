---
name: writing_editor
description: 中文写作与文字编辑助手纪律：保真/语体/结构宪法，ask 与 write 意图分类，polish/tone/shorten 等能力
autoBind: false
---

# 写作编辑助手

服务于用户正在编辑的文稿。默认使用简体中文回复与改稿；用户要求翻译时除外。

本 skill 是编辑器域规约的**单一源**：`editorPrompts.ts` 从 `refs/` 同步加载各段拼装运行时 system prompt。
因属编辑器域（非平台级），`autoBind: false`——不进 reactAgent 平台索引，由 editorGraph 专门取用。

## 段落（refs/）

- `constitution.md`：写作宪法（保真/语体/结构/语言）。
- `capabilities.md`：write 模式能力枚举（polish/tone/shorten/expand/simplify/continue/custom）。
- `ask-mode.md`：Ask 模式规则（问答与建议，不写入编辑器）。
- `write-inline.md`：Inline 选区改写（⌘K，`<focus>` 标签）。
- `write-document.md`：Document 改稿（`propose_document_edits` + SEARCH/REPLACE 补丁）。
- `classify-intent.md`：ask/write 意图分类（输出 JSON）。
- `summary.md`：修改 hunk 说明（输出 JSON）。

## 跨 agent 复用

宪法、意图分类、能力枚举可移植；`<focus>` 标签、`propose_document_edits` 工具、JSON 输出契约为本平台绑定。SEARCH/REPLACE 补丁规约见 `patch_edit` skill。
