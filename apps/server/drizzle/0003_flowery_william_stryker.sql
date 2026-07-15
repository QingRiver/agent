CREATE TABLE "kb_tags" (
	"id" text PRIMARY KEY NOT NULL,
	"kb_id" text NOT NULL,
	"name" text NOT NULL,
	"color" text,
	"owner" text,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_kb_tags_kb_owner" ON "kb_tags" USING btree ("kb_id","owner");--> statement-breakpoint
-- 同级（同 kb_id）标签名唯一；owner 可 NULL，用 COALESCE 表达式唯一索引（PG 中 NULL≠NULL，参考 uniq_kb_nodes_parent_name）
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_kb_tags_kb_name" ON "kb_tags" ("kb_id", (COALESCE("owner", '')), "name");
