---
name: patch_edit
description: SEARCH/REPLACE 补丁编辑规约：search 原文唯一匹配、replace 替换、多处拆条按序，与 Claude Code Edit / Codex 同范式
autoBind: false
---

# SEARCH/REPLACE 补丁编辑

对一篇已有全文做可审阅的修改时，用一组 SEARCH/REPLACE 补丁描述，调用 `propose_document_edits`（或宿主等价工具）应用。

## 补丁规约

- `search`：必须是原文中**恰好出现一次**的连续片段；不要依赖字符偏移，按文字匹配定位。
- `replace`：替换后文本；空字符串表示删除该片段。
- 多处修改拆成多条 edits，按套用顺序排列。
- 片段外除非指令要求，保持最小改动。

## 输出约束

- 不要在助手正文输出全文或补丁原文。
- 不要 markdown 代码围栏。
- 不要谎称已写入编辑器；修改是否应用由宿主/用户决定。

## 跨 agent 复用

此规约与 Claude Code 的 `Edit` 工具、Codex 的补丁编辑同范式。其他 agent 无 `propose_document_edits` 时，按各自等价的 SEARCH/REPLACE / old_str-new_str 工具履行同一纪律。

## 绑定

- 工具名 `propose_document_edits`（本平台）。
- 修改说明（hunk summary）：每条补丁写不超过 20 字的动词开头说明，如「改为书面语气」「修正错别字」「压缩冗余」；禁止空泛的「优化」「改进」。
