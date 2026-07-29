-- 公共 tags + kb_doc_tags。旧标签数据直接丢弃，不做兼容或回填。

CREATE TABLE IF NOT EXISTS "tags" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"color" text,
	"sync_id" bigint,
	"deleted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tags_user_syncid" ON "tags" USING btree ("user_id","sync_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tags_user_name" ON "tags" USING btree ("user_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_tags_user_name_live" ON "tags" ("user_id", "name") WHERE "deleted" = false;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "kb_doc_tags" (
	"doc_id" text NOT NULL,
	"tag_id" text NOT NULL,
	CONSTRAINT "kb_doc_tags_doc_id_tag_id_pk" PRIMARY KEY("doc_id","tag_id")
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_kb_doc_tags_tag" ON "kb_doc_tags" USING btree ("tag_id");--> statement-breakpoint

ALTER TABLE "gtd_task_tags" DROP CONSTRAINT IF EXISTS "gtd_task_tags_tag_id_gtd_tags_id_fk";--> statement-breakpoint
TRUNCATE TABLE "gtd_task_tags";--> statement-breakpoint
UPDATE "gtd_projects" SET "default_tag_ids" = ARRAY[]::text[];--> statement-breakpoint
ALTER TABLE "gtd_task_tags" ADD CONSTRAINT "gtd_task_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE cascade;--> statement-breakpoint

ALTER TABLE "kb_doc_tags" ADD CONSTRAINT "kb_doc_tags_doc_id_kb_documents_id_fk" FOREIGN KEY ("doc_id") REFERENCES "kb_documents"("id") ON DELETE cascade;--> statement-breakpoint
ALTER TABLE "kb_doc_tags" ADD CONSTRAINT "kb_doc_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE cascade;--> statement-breakpoint

DROP INDEX IF EXISTS "idx_kb_docs_tags";--> statement-breakpoint
ALTER TABLE "kb_documents" DROP COLUMN IF EXISTS "tags";--> statement-breakpoint
DROP TABLE IF EXISTS "kb_tags";--> statement-breakpoint
DROP TABLE IF EXISTS "gtd_tags";
