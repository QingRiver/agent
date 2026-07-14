import type { AnyPgColumn } from 'drizzle-orm/pg-core'
import { bigint, boolean, index, integer, jsonb, pgTable, text } from 'drizzle-orm/pg-core'

export const conversationThreads = pgTable('conversation_threads', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  agentId: text('agent_id').notNull(),
  title: text('title').notNull(),
  pinned: boolean('pinned').notNull().default(false),
  seq: integer('seq').notNull(),
  createdAt: bigint('created_at', { mode: 'number' }).notNull(),
  updatedAt: bigint('updated_at', { mode: 'number' }).notNull(),
}, table => [
  index('idx_conv_user_list').on(table.userId, table.pinned, table.updatedAt),
])

/**
 * 虚拟路径树的文件夹节点。文档（kb_documents）通过 parent_node_id 挂在节点下，
 * vdir 由父链 walk 派生并缓存到 kb_documents.vdir。文件夹身份（id）与名字/位置解耦，
 * 重命名/移动文件夹只动一行 + 后代 vdir 重算，不触向量。
 */
export const kbNodes = pgTable('kb_nodes', {
  id: text('id').primaryKey(),
  kbId: text('kb_id').notNull(),
  parentId: text('parent_id').references((): AnyPgColumn => kbNodes.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  owner: text('owner'),
  visibility: text('visibility').notNull().default('private'),
  permissions: jsonb('permissions').notNull().default({}),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: bigint('created_at', { mode: 'number' }).notNull(),
  updatedAt: bigint('updated_at', { mode: 'number' }).notNull(),
}, table => [
  index('idx_kb_nodes_kb_parent').on(table.kbId, table.parentId),
  index('idx_kb_nodes_owner').on(table.kbId, table.owner),
  // 同级不重名：真实唯一约束见迁移 uniq_kb_nodes_parent_name
  // (kb_id, COALESCE(parent_id, ''), name) — PG 中 NULL≠NULL，不能用 (kb_id, parent_id, name) 裸 unique
])

/**
 * 文档事实源：草稿正文 + 元数据 + 提交状态机。
 * id（uuid）= chunk 关联用 source_doc_id，与路径/内容解耦。
 * 草稿/提交分离：saveDraft 只动 content/draft_hash/updated_at；commit 才跑 chunk+enrich+embed+Qdrant。
 */
export const kbDocuments = pgTable('kb_documents', {
  id: text('id').primaryKey(),
  kbId: text('kb_id').notNull(),
  parentNodeId: text('parent_node_id').references(() => kbNodes.id, { onDelete: 'set null' }),
  name: text('name').notNull(),
  filename: text('filename'),
  /** 派生缓存：父链 name 拼接 + 自身 name；移动/重命名时重算（纯字符串，不 embed） */
  vdir: text('vdir'),
  /** 草稿正文 markdown 全文（事实源，编辑/预览/当前文档上下文用） */
  content: text('content').notNull().default(''),
  draftHash: text('draft_hash'),
  publishedHash: text('published_hash'),
  tags: text('tags').array(),
  owner: text('owner'),
  summary: text('summary'),
  keywords: text('keywords').array(),
  toc: text('toc').array(),
  visibility: text('visibility').notNull().default('private'),
  permissions: jsonb('permissions').notNull().default({}),
  pinned: boolean('pinned').notNull().default(false),
  /** draft=有未提交改动；indexing=提交中；completed=已提交已索引；error=提交失败 */
  indexingStatus: text('indexing_status').notNull().default('draft'),
  error: text('error'),
  createdAt: bigint('created_at', { mode: 'number' }).notNull(),
  updatedAt: bigint('updated_at', { mode: 'number' }).notNull(),
  indexedAt: bigint('indexed_at', { mode: 'number' }),
}, table => [
  index('idx_kb_docs_kb_owner').on(table.kbId, table.owner),
  index('idx_kb_docs_kb_parent').on(table.kbId, table.parentNodeId),
  index('idx_kb_docs_kb_vdir').on(table.kbId, table.vdir),
  index('idx_kb_docs_kb_list').on(table.kbId, table.pinned, table.updatedAt),
  // tags 用 GIN（迁移 idx_kb_docs_tags）；@>  containment
])

/**
 * chunk 桥接表：持有 Qdrant point id（id = point id），PG 拥有映射权。
 * 删文档 = DELETE kb_chunks WHERE doc_id（FK 级联）→ 取 id 列表 → Qdrant delete_by_ids。永不孤儿。
 */
export const kbChunks = pgTable('kb_chunks', {
  id: text('id').primaryKey(),
  docId: text('doc_id').notNull().references(() => kbDocuments.id, { onDelete: 'cascade' }),
  position: integer('position').notNull(),
  content: text('content').notNull(),
  contentHash: text('content_hash'),
  headingPath: text('heading_path').array(),
  pageNumber: integer('page_number'),
  enabled: boolean('enabled').notNull().default(true),
  createdAt: bigint('created_at', { mode: 'number' }).notNull(),
}, table => [
  index('idx_kb_chunks_doc').on(table.docId),
  index('idx_kb_chunks_doc_enabled').on(table.docId, table.enabled),
])
