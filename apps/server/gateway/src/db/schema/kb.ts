import { bigint, boolean, index, integer, jsonb, pgTable, primaryKey, text } from 'drizzle-orm/pg-core'
import { tags } from './tags'

/**
 * 文档事实源：草稿正文 + 元数据 + 提交状态机。
 * id（uuid）= chunk 关联用 source_doc_id，与路径/内容解耦。
 * 草稿/提交分离：saveDraft 只动 content/draft_hash/updated_at；commit 才跑 chunk+enrich+embed+Qdrant。
 *
 * 并入统一 dirs 树（废弃 kb_nodes）。
 * - mountDirId = 挂载到 dirs.id（权威位置，无 FK 靠 server stamp 校验存活，同 task 模式）；null=未归位/Inbox
 * - projectId = walkToProjectRoot(mountDirId) 冗余缓存（server 维护，非 LWW）
 * - userId = 属主隔离（对齐 dirs.userId）；kbId 降为分区标签不再驱动树隔离/collection
 * - vdir = 派生展示缓存（mountDir.vdir + '/' + name，不进 Qdrant payload）
 */
export const kbDocuments = pgTable('kb_documents', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  kbId: text('kb_id').notNull().default('kb_default'),
  /** 挂载到 dirs.id（权威位置）；null=未归位/Inbox。无 FK——dir 存活由 server stamp 校验修正 */
  mountDirId: text('mount_dir_id'),
  /** 冗余缓存 = walkToProjectRoot(mountDirId)（server 维护，非 LWW）；Inbox→null */
  projectId: text('project_id'),
  name: text('name').notNull(),
  filename: text('filename'),
  /** 派生展示缓存：mountDir.vdir + '/' + name；移动/重命名时重算（纯字符串，不 embed，不进 Qdrant payload） */
  vdir: text('vdir'),
  /** 草稿正文 markdown 全文（事实源，编辑/预览/当前文档上下文用） */
  content: text('content').notNull().default(''),
  draftHash: text('draft_hash'),
  publishedHash: text('published_hash'),
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
  index('idx_kb_docs_user_owner').on(table.userId, table.owner),
  index('idx_kb_docs_user_mount').on(table.userId, table.mountDirId),
  index('idx_kb_docs_user_project').on(table.userId, table.projectId),
  index('idx_kb_docs_user_vdir').on(table.userId, table.vdir),
  index('idx_kb_docs_user_list').on(table.userId, table.pinned, table.updatedAt),
])

/** 文档 ↔ 公共标签（tag id）。 */
export const kbDocTags = pgTable('kb_doc_tags', {
  docId: text('doc_id').notNull().references(() => kbDocuments.id, { onDelete: 'cascade' }),
  tagId: text('tag_id').notNull().references(() => tags.id, { onDelete: 'cascade' }),
}, table => ({
  pk: primaryKey({ columns: [table.docId, table.tagId] }),
  tagIdx: index('idx_kb_doc_tags_tag').on(table.tagId),
}))

/**
 * chunk 桥接表：持有 Qdrant point id（id = point id），PG 拥有映射权。
 * 删文档 = DELETE kb_chunks WHERE doc_id（FK 级联）→ 取 id 列表 → Qdrant delete_by_ids。永不孤儿。
 */
export const kbChunks = pgTable('kb_chunks', {
  id: text('id').primaryKey(),
  docId: text('doc_id').notNull().references(() => kbDocuments.id, { onDelete: 'cascade' }),
  position: integer('position').notNull(),
  content: text('content').notNull(),
  headingPath: text('heading_path').array(),
  pageNumber: integer('page_number'),
  createdAt: bigint('created_at', { mode: 'number' }).notNull(),
}, table => [
  index('idx_kb_chunks_doc').on(table.docId),
])
