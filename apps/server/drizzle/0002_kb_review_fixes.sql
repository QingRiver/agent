-- 根级 parent_id NULL 时 PG 裸 unique 不生效（NULL≠NULL）；改为 COALESCE 表达式唯一索引
DROP INDEX IF EXISTS "uniq_kb_nodes_parent_name";--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_kb_nodes_parent_name" ON "kb_nodes" ("kb_id", (COALESCE("parent_id", '')), "name");--> statement-breakpoint
-- tags 数组 containment（@>）改用 GIN
DROP INDEX IF EXISTS "idx_kb_docs_tags";--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_kb_docs_tags" ON "kb_documents" USING gin ("tags");
