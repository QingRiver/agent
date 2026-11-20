-- GTD 改为服务端权威当前行：旧表与存量全部丢掉，只留 gtd_rows。
DROP TABLE IF EXISTS "gtd_task_tags" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "gtd_attachments" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "gtd_perspectives" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "gtd_tasks" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "gtd_sync_mutations" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "gtd_sync_clocks" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "gtd_txns" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "gtd_tombstones" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "gtd_clients" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "gtd_heads" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "gtd_rows" CASCADE;--> statement-breakpoint
CREATE TABLE "gtd_rows" (
	"user_id" text NOT NULL,
	"entity" text NOT NULL,
	"id" text NOT NULL,
	"data" jsonb NOT NULL,
	"sync_id" bigint DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gtd_rows_user_id_entity_id_pk" PRIMARY KEY("user_id","entity","id"),
	CONSTRAINT "ck_gtd_rows_entity" CHECK (entity IN ('task', 'task_tag', 'perspective', 'attachment'))
);--> statement-breakpoint
CREATE INDEX "idx_gtd_rows_task_mount" ON "gtd_rows" USING btree ("user_id",(("data"->>'mountDirId'))) WHERE entity = 'task';--> statement-breakpoint
CREATE INDEX "idx_gtd_rows_task_tag" ON "gtd_rows" USING btree ("user_id",(("data"->>'tagId'))) WHERE entity = 'task_tag';
