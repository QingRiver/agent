# 知识库管理 · 接口文档（第一期：服务端）

> 基础路径 `/api/kb`。所有路由需登录（`Authorization: Bearer <token>`）。`user.id` 作为创建操作的 `owner`；**读写均按 owner 隔离**（他人资源统一 404）。
>
> **存储模型**：PostgreSQL 作事实源（`kb_nodes` 文件夹树 / `kb_documents` 文档+草稿 / `kb_chunks` chunk 桥接表），Qdrant 作派生向量索引（已提交 chunk）。**草稿/提交分离**：编辑只动 PG 草稿（零向量），提交才跑 chunk+enrich+embed+Qdrant。
>
> **虚拟路径 `vdir`**：由 `parent_node_id` 链 walk 派生并缓存；移动/重命名只重算 `vdir` 缓存 + Qdrant `setPayload`，**不重 embed**。检索正文仍读 Qdrant payload `raw_text`（不做 PG hydrate）。

## 状态机（`indexingStatus`）

| 状态 | 含义 |
|---|---|
| `draft` | 有未提交改动（`draftHash !== publishedHash`） |
| `indexing` | 提交处理中（同步请求内），此期间再次 `POST /commit` 或 `PATCH` content → **409** |
| `completed` | 已提交且已索引 |
| `error` | 提交失败，`error` 字段含原因，可重新提交 |

## 通用响应

成功 200 返回 JSON；错误返回 `{ "error": string }` + 状态码。校验失败 400；未找到 / 非本人资源 **404**；提交/indexing 冲突 **409**。

---

## 文件夹节点

### GET `/nodes?kbId=`
列出当前用户的文件夹节点（树形，前端按 `parentId` 组装）。
- query: `kbId?`（缺省 `env.KB_COLLECTION`）
- 响应：`{ nodes: KbNodeRow[] }`

```jsonc
// KbNodeRow
{ "id": "uuid", "kbId": "kb_default", "parentId": "uuid|null",
  "name": "rust", "owner": "user-id", "visibility": "private",
  "sortOrder": 0, "createdAt": 0, "updatedAt": 0 }
```

### POST `/nodes`
新建文件夹。
- body: `{ kbId?: string, parentId?: string|null, name: string, owner?: string }`
- `owner` 由 `user.id` 覆盖（忽略请求体 `owner`）
- 响应：`{ node: KbNodeRow }`

### PATCH `/nodes/:id`
重命名/移动文件夹（可同时传 `name` + `parentId`，一次重算）。
- body: `{ name?: string, parentId?: string|null }`
- 用资源自身的 `kbId`（不依赖默认 collection）
- 响应：`{ node: KbNodeRow }`；会重算该 kb 所有文档 `vdir` + 已提交文档 Qdrant `setPayload(vdir)`（不重 embed）
- 把文件夹挂到自身或其后代下 → **409**

### DELETE `/nodes/:id`
删除文件夹。级联删子文件夹；其下文档 `parent_node_id` SET NULL（变根级，不删文档），`vdir` 重算并同步 Qdrant。

---

## 文档草稿

### GET `/documents?kbId=&tag=&owner=&vdir=&parentNodeId=`
列表（不含 `content`）。默认只返回当前用户文档；`owner` 若传且不等于当前用户则忽略，仍滤自己。
- `vdir`：精确前缀（`vdir = prefix OR vdir LIKE 'prefix/%'`）
- `parentNodeId`：uuid，或字面量 `null` 表示仅根级文档
- 响应：`{ docs: KbDocSummary[] }`，按 `pinned desc, updatedAt desc`

```jsonc
// KbDocSummary
{ "id":"uuid","kbId":"kb_default","parentNodeId":"uuid|null","name":"basics",
  "filename":"basics.md","vdir":"notes/rust/basics","tags":["x"],"owner":"user-id",
  "summary":"...","keywords":[],"toc":[],"visibility":"private","pinned":false,
  "indexingStatus":"draft","error":null,"draftHash":"...","publishedHash":null,
  "createdAt":0,"updatedAt":0,"indexedAt":null }
```

### GET `/documents/:id`
取单篇含草稿正文（仅 owner）。非本人 / 不存在 → 404。

### POST `/documents`
新建空白/快速捕获笔记（草稿）。
- body: `{ kbId?: string, parentNodeId?: string|null, name: string, content?: string, owner?: string, tags?: string[] }`
- `owner` 由 `user.id` 覆盖
- 响应：`{ doc: KbDoc }`，`indexingStatus: "draft"`

### PATCH `/documents/:id`
**草稿保存（含 `content`）或元数据更新（无 `content`）二选一**——按 body 是否含 `content` 分发：
- 含 `content` → 草稿保存：`{ content?: string, name?: string }`。内容变则标脏（`completed→draft`），不触向量。若 `indexing` 中 → **409**。
- 不含 `content` → 元数据更新：`{ tags?, parentNodeId?, name?, owner?, visibility?, pinned? }`。位置/名称变 → 重算 `vdir` + Qdrant `setPayload`（**不重 embed**）；`tags` 变 → 已提交则 `setPayload(tags)`。
- 响应：`{ doc: KbDoc }`；404 未找到/非本人

### POST `/documents/:id/commit`
**同步**提交草稿：chunk + enrich + embed + Qdrant 重建，完成后才返回。
- body: `{ skipEnrich?: boolean }`（`skipEnrich=true` 跳过 LLM 摘要/关键词生成，测试/离线用）
- 响应：`{ doc: KbDoc }`（`indexingStatus: "completed"`）
- 已在 `indexing` 中 → **409** `{ error: "document is already indexing" }`
- 提交失败 → `indexingStatus: "error"` + `error` 字段，HTTP 仍抛错

### POST `/documents/batch-commit`
批量提交（串行、同步）。
- body: `{ ids: string[], skipEnrich?: boolean }`
- 任一篇非本人 → 404；遇 409 立即返回
- 响应：`{ ok: true }`

### DELETE `/documents/:id`
删除文档。取 `kb_chunks.id` → Qdrant `delete(points)` + 删 PG 行（级联删 `kb_chunks`），永不孤儿。

---

## 标签

### GET `/tags?kbId=`
当前用户文档的 distinct 标签。响应：`{ tags: string[] }`

---

## 引入（markitdown → 草稿，不自动提交）

### POST `/ingest`
多文件上传（`multipart/form-data`）。
- 字段：`files`（File[]）、`kbId?`、`tags?`（逗号分隔字符串）、`parentNodeId?`
- 每文件：`loadDocumentMarkdown`（`.md` 直通，否则调 markitdown 服务 `KB_MARKITDOWN_URL`）→ `cleanMarkdown` → 建草稿
- 去重：同 `parentNodeId+name` 已存在且 `draftHash` 相同 → `skipped: true`；内容变 → 更新草稿并回退 `completed→draft`
- 响应：`{ items: [{ docId, name, vdir, skipped }][] }`
- markitdown 服务不可达 → 500 `{ error: "markitdown convert failed (...)" }`

### POST `/ingest/path`
服务端路径/目录导入（相对起点**最多递归 5 层**子目录）。
- body: `{ path: string, kbId?: string, base?: string, tags?: string[], owner?: string }`
- 遍历目录树，`rel = path.relative(base, file)` → `ensureNodePath` 建文件夹链 → 同 `ingest` 流程
- 支持 `.md/.markdown/.docx/.pdf/.html/.htm/.txt`
- 响应：`{ items: [...] }`

### POST `/ingest/text`
粘贴文本直建草稿（跳过 markitdown）。
- body: `{ kbId?: string, content: string, name: string, parentNodeId?: string|null, owner?: string, tags?: string[] }`
- 响应：`{ doc: KbDoc }`

---

## 检索（兼容旧入口）

### POST `/query`
RAG 检索（kbGraph，走已提交 chunk；正文来自 Qdrant `raw_text`）。
- body: `{ query: string, kbId?: string }`
- 响应：`{ result: RetrieveAndRerankResult }`（`chunks`/`citations`/`fallback`）

### GET `/manage?kbId=`
兼容旧 `/kb/manage`，内部转 `listDocs`（仅当前用户）。响应：`{ kbId, documents: KbDocSummary[] }`

---

## 关键不变量

- **身份解耦**：`kb_documents.id`（uuid）= `source_doc_id`，与路径/内容无关；`kb_chunks.id`（uuid）= Qdrant point id。移动/重命名不改变任何 id，故 chunks/Qdrant 点不变 → **不重 embed**。
- **PG 驱动清理**：删文档 = 取 point ids → `delete(points)` + `DELETE` PG（级联）；删文件夹 = 级联 + 文档 SET NULL → 根级。**永不孤儿**。
- **草稿零向量**：`saveDraft`/`createDraft`/`ingest*` 只动 PG，不碰 Qdrant。
- **双路检索（产品约定）**：当前文档上下文读 PG `content`（草稿）；`@` 全库检索走 Qdrant 已提交 chunk（payload 含 `raw_text`，未提交的不在检索范围）。
