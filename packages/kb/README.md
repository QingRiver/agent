# @agent/kb

知识库**算法库**（非 HTTP）：入库、embedding、稀疏/稠密检索、rerank、引文校验。Server 负责 API 与存储编排，本包负责检索管道。

## 导出概览

| 模块 | 典型导出 |
|------|----------|
| ingest | `convertToMarkdown`、`chunkMarkdown`、`embedAndUpsert`、`hashContent` |
| qdrant | `getQdrantClient`、`ensureCollection`、`upsertChunks` |
| embedding | `embedTexts`、`embedQuery` |
| sparse | `QdrantBm25Provider`、`BgeM3SparseProvider` |
| retrieve | `hybridRetrieve`、`retrieveAndRerank`、`rewriteQuery`、`validateCitations` |
| rerank | `rerankDocuments`、`llmFallbackDecision` |

## 目录

```text
src/
├── ingest/     # MarkItDown、清洗、切块、入库
├── embedding/  # SiliconFlow embedding
├── qdrant/     # Collection / upsert
├── sparse/     # BM25 / BGE-M3 稀疏
├── retrieve/   # 混合召回、rewrite、引文
├── rerank/     # rerank + LLM fallback
└── types.ts
fixtures/       # 测试样例
```

## 使用

```ts
import { retrieveAndRerank, rewriteQuery, validateCitations } from '@agent/kb'
```

- **Server**：`apps/server/src/service/kb.ts`、seed / clear 脚本
- **Graph**：`kbGraph` 调用 `retrieveAndRerank` 等
- 依赖 `@agent/env`（`QDRANT_URL`、`SILICONFLOW_*`、`KB_*` 等）

## 前置

```bash
# 仓库根目录
pnpm devops infra up kb    # qdrant + markitdown
pnpm devops e2e seed       # 可选：导入 E2E 样例
```

## 常用命令

```bash
pnpm --filter @agent/kb tc
pnpm test
```

## 相关文档

- 仓库根 [README](../../README.md)
- [wiki/RAG.md](../../wiki/RAG.md) — 管线设计主文档
- Server API：[apps/server/docs/kb-api.md](../../apps/server/docs/kb-api.md)
- [apps/server/README.md](../../apps/server/README.md)
