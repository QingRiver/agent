-- GTD 同步改为事务重放（wiki/GTD-事务重放.md）：旧的按命令重算的行表与存量数据全部删除。
DROP TABLE IF EXISTS "gtd_task_tags" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "gtd_attachments" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "gtd_perspectives" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "gtd_tasks" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "gtd_sync_mutations" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "gtd_sync_clocks" CASCADE;--> statement-breakpoint
CREATE TABLE "gtd_heads" (
	"user_id" text PRIMARY KEY NOT NULL,
	"seq" bigint DEFAULT 0 NOT NULL,
	"compacted_seq" bigint DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "gtd_txns" (
	"user_id" text NOT NULL,
	"seq" bigint NOT NULL,
	"txn_id" text NOT NULL,
	"client_id" text NOT NULL,
	"client_seq" bigint NOT NULL,
	"client_ts" text NOT NULL,
	"writes" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gtd_txns_user_id_seq_pk" PRIMARY KEY("user_id","seq")
);--> statement-breakpoint
CREATE TABLE "gtd_rows" (
	"user_id" text NOT NULL,
	"entity" text NOT NULL,
	"id" text NOT NULL,
	"data" jsonb NOT NULL,
	"last_seq" bigint NOT NULL,
	CONSTRAINT "gtd_rows_user_id_entity_id_pk" PRIMARY KEY("user_id","entity","id"),
	CONSTRAINT "ck_gtd_rows_entity" CHECK (entity IN ('task', 'task_tag', 'perspective', 'attachment'))
);--> statement-breakpoint
CREATE TABLE "gtd_tombstones" (
	"user_id" text NOT NULL,
	"task_id" text NOT NULL,
	CONSTRAINT "gtd_tombstones_user_id_task_id_pk" PRIMARY KEY("user_id","task_id")
);--> statement-breakpoint
CREATE TABLE "gtd_clients" (
	"user_id" text NOT NULL,
	"client_id" text NOT NULL,
	"client_seq" bigint NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gtd_clients_user_id_client_id_pk" PRIMARY KEY("user_id","client_id")
);--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_gtd_txns_user_client_seq" ON "gtd_txns" USING btree ("user_id","client_id","client_seq");--> statement-breakpoint
CREATE INDEX "idx_gtd_rows_task_mount" ON "gtd_rows" USING btree ("user_id",("data"->>'mountDirId')) WHERE entity = 'task';--> statement-breakpoint
CREATE INDEX "idx_gtd_rows_task_tag" ON "gtd_rows" USING btree ("user_id",("data"->>'tagId')) WHERE entity = 'task_tag';
