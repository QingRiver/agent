# 知识库管理 · 接口文档（第一期：服务端）

> 基础路径 `/api/kb`。所有路由需登录（`Authorization: Bearer <token>`）。`user.id` 作为创建操作的 `owner`；**读写均按 owner 隔离**（他人资源统一 404）。
>
> **路由风格**：动词进 path，全 `POST`，看 path 即知动作，不靠 HTTP method 区分语义。list 类查询参数走 body（非 query string）。`kbId` 必填（知识库隔离键，前端传 `kb_default`）。
>
> **存储模型**：PostgreSQL 作事实源（`kb_nodes` 文件夹树 / `kb_documents` 文档+草稿 / `kb_chunks` chunk 桥接表），Qdrant 作派生向量索引（已提交 chunk）。**草稿/提交分离**：编辑只动 PG 草稿（零向量），提交才跑 chunk+enrich+embed+Qdrant。
>
> **虚拟路径 `vdir`**：由 `parent_node_id` 链 walk 派生并缓存；移动/重命名只重算 `vdir` 缓存 + Qdrant `setPayload`，**不重 embed**。检索正文仍读 Qdrant payload `raw_text`（不做 PG hydrate）。

## 状态机（`indexingStatus`）

| 状态 | 含义 |
|---|---|
| `draft` | 有未提交改动（`draftHash !== publishedHash`） |
| `indexing` | 提交处理中（同步请求内），此期间再次 `commit` 或 `save-draft` 改 content → **409** |
| `completed` | 已提交且已索引 |
| `error` | 提交失败，`error` 字段含原因，可重新提交 |

## 通用响应

成功 200 返回 JSON；错误返回 `{ "error": string }` + 状态码。校验失败 400；未找到 / 非本人资源 **404**；提交/indexing 冲突 **409**。

---

## 文件夹节点

### POST `/nodes/list`
列出当前用户的文件夹节点（树形，前端按 `parentId` 组装）。
- body: `{ kbId: string }`（必填）
- 响应：`{ nodes: KbNodeRow[] }`

```jsonc
// KbNodeRow
{ "id": "uuid", "kbId": "kb_default", "parentId": "uuid|null",
  "name": "rust", "owner": "user-id", "visibility": "private",
  "sortOrder": 0, "createdAt": 0, "updatedAt": 0 }
```

### POST `/nodes/create`
新建文件夹。
- body: `{ kbId: string, parentId?: string|null, name: string, owner?: string }`（`kbId` 必填）
- `owner` 由 `user.id` 覆盖（忽略请求体 `owner`）
- 响应：`{ node: KbNodeRow }`

### POST `/nodes/:id/rename`
重命名文件夹。
- body: `{ name: string }`（必填）
- 用资源自身的 `kbId`（不依赖默认 collection）
- 同级重名 → **409**；响应：`{ node: KbNodeRow }`；重算该 kb 所有文档 `vdir` + 已提交文档 Qdrant `setPayload(vdir)`（不重 embed）

### POST `/nodes/:id/move`
移动文件夹到指定父下。
- body: `{ parentId: string }`（必填，目标父 uuid）
- 移到自身或其后代下 → **409**；同级重名 → **409**
- 响应：`{ node: KbNodeRow }`；重算 vdir + setPayload（不重 embed）

### POST `/nodes/:id/move-to-root`
移动文件夹到根级（`parent_id = null`）。无 body。
- 同级重名 → **409**；响应：`{ node: KbNodeRow }`

### POST `/nodes/:id/delete`
删除文件夹。级联删子文件夹；其下文档 `parent_node_id` SET NULL（变根级，不删文档），`vdir` 重算并同步 Qdrant。

---

## 文档草稿

### POST `/documents/list`
列表（不含 `content`）。默认只返回当前用户文档；`owner` 若传且不等于当前用户则忽略，仍滤自己。
- body: `{ kbId: string, tag?: string, owner?: string, vdirPrefix?: string, parentNodeId?: string|null }`（`kbId` 必填）
- `vdirPrefix`：精确前缀（`vdir = prefix OR vdir LIKE 'prefix/%'`）
- `parentNodeId`：uuid 表该父下；`null` 表仅根级文档
- 响应：`{ docs: KbDocSummary[] }`，按 `pinned desc, updatedAt desc`

```jsonc
// KbDocSummary
{ "id":"uuid","kbId":"kb_default","parentNodeId":"uuid|null","name":"basics",
  "filename":"basics.md","vdir":"notes/rust/basics","tags":["x"],"owner":"user-id",
  "summary":"...","keywords":[],"toc":[],"visibility":"private","pinned":false,
  "indexingStatus":"draft","error":null,"draftHash":"...","publishedHash":null,
  "createdAt":0,"updatedAt":0,"indexedAt":null }
```

### POST `/documents/:id/get`
取单篇含草稿正文（仅 owner）。非本人 / 不存在 → 404。

### POST `/documents/create`
新建空白/快速捕获笔记（草稿）。
- body: `{ kbId: string, parentNodeId?: string|null, name: string, content?: string, owner?: string, tags?: string[] }`（`kbId` 必填）
- `owner` 由 `user.id` 覆盖
- 响应：`{ doc: KbDoc }`，`indexingStatus: "draft"`

### POST `/documents/:id/save-draft`
草稿保存：`{ content?: string, name?: string }`。内容变则标脏（`completed→draft`、清 error），不触向量；改名重算 `vdir`。若 `indexing` 中 → **409**。
- 响应：`{ doc: KbDoc }`；404 未找到/非本人

### POST `/documents/:id/update-meta`
元数据更新：`{ tags?, parentNodeId?, name?, owner?, visibility?, pinned? }`。位置/名称变 → 重算 `vdir` + Qdrant `setPayload`（**不重 embed**）；`tags` 变 → 已提交则 `setPayload(tags)`。
- 响应：`{ doc: KbDoc }`；404 未找到/非本人

### POST `/documents/:id/commit`
**同步**提交草稿：chunk + enrich + embed + Qdrant 重建，完成后才返回。
- body: `{ skipEnrich?: boolean }`（`skipEnrich=true` 跳过 LLM 摘要/关键词生成，测试/离线用；service 层 `commit` 签名已改全必填 `{skipEnrich:boolean}`，handler 透传 `req.skipEnrich === true`）
- 响应：`{ doc: KbDoc }`（`indexingStatus: "completed"`）
- 已在 `indexing` 中 → **409** `{ error: "document is already indexing" }`
- 提交失败 → `indexingStatus: "error"` + `error` 字段，HTTP 仍抛错

### POST `/documents/batch-commit`
批量提交（串行、同步）。
- body: `{ ids: string[], skipEnrich?: boolean }`
- 任一篇非本人 → 404；遇 409 立即返回
- 响应：`{ ok: true }`

### POST `/documents/:id/delete`
删除文档。取 `kb_chunks.id` → Qdrant `delete(points)` + 删 PG 行（级联删 `kb_chunks`），永不孤儿。

---

## 标签

标签元数据存 `kb_tags` 表（id/kbId/name/color/owner，唯一 (kbId,name)）；文档仍用 `kb_documents.tags` text[] 存 tag **name**，但必须是 `kb_tags` 表成员（加 tag 时 name 不在表则 service 自动建标签）。重命名/删除标签时同步刷所有引用文档的 `kb_documents.tags` + 已提交文档 Qdrant payload tags。

### POST `/tags/list`
列出当前用户标签。body: `{ kbId: string }`（必填）。响应：`{ tags: KbTagRow[] }`（`{id,name,color,owner,...}`）

### POST `/tags/create`
新建标签。body: `{ kbId: string, name: string, color?: string }`（`kbId`/`name` 必填）。`owner` 由 `user.id` 覆盖。同名（同 kb+owner）→ **409**。响应：`{ tag: KbTagRow }`

### POST `/tags/:id/rename`
重命名标签。body: `{ name: string }`。刷所有引用旧 name 的文档 `kb_documents.tags` → 新 name + 已提交文档 Qdrant payload tags；再改 `kb_tags.name`。同名冲突 → **409**；非本人 → **404**。响应：`{ affectedDocs: number }`

### POST `/tags/:id/delete`
删除标签。body: `{ dryRun?: boolean }`。
- `dryRun=true`：只查影响数，**不删**。响应：`{ affectedDocs: number }`（引用该标签的文档数）
- `dryRun=false`（默认）：从所有引用文档的 `kb_documents.tags` 移除该 name + 已提交文档 Qdrant payload 同步；删 `kb_tags` 行。**文档保留**（只去标签）。非本人 → **404**。响应：`{ affectedDocs: number }`

### POST `/tags/:id/update-color`
改标签颜色。body: `{ color: string | null }`。仅改 `kb_tags.color`，不触文档/Qdrant。非本人 → **404**。响应：`{ tag: KbTagRow }`

---


## 引入（markitdown → 草稿，不自动提交）

### POST `/ingest/files`
多文件上传（`multipart/form-data`）。
- 字段：`files`（File[]）、`kbId`（必填）、`tags?`（逗号分隔字符串）、`parentNodeId?`
- 每文件：`loadDocumentMarkdown`（`.md` 直通，否则调 markitdown 服务 `KB_MARKITDOWN_URL`）→ `cleanMarkdown` → 建草稿
- 去重：同 `parentNodeId+name` 已存在且 `draftHash` 相同 → `skipped: true`；内容变 → 更新草稿并回退 `completed→draft`
- 响应：`{ items: [{ docId, name, vdir, skipped }][] }`
- markitdown 服务不可达 → 500 `{ error: "markitdown convert failed (...)" }`

### POST `/ingest/zip`
zip 压缩包上传导入（`multipart/form-data`，按包内目录结构还原，**最多递归 5 层**子目录）。
- 字段：`file`（File，zip）、`kbId`（必填）、`tags?`（逗号分隔字符串）
- 解压遍历 entry，相对路径段 → `ensureNodePath` 建文件夹链（挂根级）→ 同 `ingest/files` 流程
- 支持 `.md/.markdown`（**仅 Markdown**）；自动忽略目录与 `__MACOSX`/`.DS_Store`/`._*` 等
- zip slip 防护：含 `..` 逃逸段的 entry 跳过，不中断整批
- 响应：`{ items: [...] }`

### POST `/ingest/text`
粘贴文本直建草稿（跳过 markitdown）。
- body: `{ kbId: string, content: string, name: string, parentNodeId?: string|null, owner?: string, tags?: string[] }`（`kbId` 必填）
- 响应：`{ doc: KbDoc }`

---

## 检索

### POST `/query`
RAG 检索（kbGraph，走已提交 chunk；正文来自 Qdrant `raw_text`）。
- body: `{ query: string, kbId: string, options?: { recallK?, skipRerank? } }`（`kbId` 必填）
  - `options.skipRerank: true`：跳过 `rerankDocuments`（硅基流动 bge-reranker）+ `llmFallbackDecision`（低分时 LLM 判断），直接返回 RRF 融合 top-K（取 `KB_RERANK_TOPK` 条）。默认走完整 rerank + fallback。测试/自验省时置 true。
  - `options.recallK`：每路召回条数（`/query` 路径默认 60）。底层 `retrieveAndRerank` 的 options 字段全部必填，默认值由调用方给出（`KbService.query` 给 60，kbGraph 给 `env.KB_RECALL_K`，retry_wider 时给 `env.KB_RECALL_K * 2`）。
- 响应：`{ result: RerankRetrieveResult }`（`chunks` + 可选 `fallback: { decision, message }`；跳过 rerank 时无 `rerank_score`/`fallback`，`score` 为 RRF 累加分）

---

## 关键不变量

- **身份解耦**：`kb_documents.id`（uuid）= `source_doc_id`，与路径/内容无关；`kb_chunks.id`（uuid）= Qdrant point id。移动/重命名不改变任何 id，故 chunks/Qdrant 点不变 → **不重 embed**。
- **PG 驱动清理**：删文档 = 取 point ids → `delete(points)` + `DELETE` PG（级联）；删文件夹 = 级联 + 文档 SET NULL → 根级。**永不孤儿**。
- **草稿零向量**：`saveDraft`/`createDraft`/`ingest*` 只动 PG，不碰 Qdrant。
- **双路检索（产品约定）**：当前文档上下文读 PG `content`（草稿）；`@` 全库检索走 Qdrant 已提交 chunk（payload 含 `raw_text`，未提交的不在检索范围）。
