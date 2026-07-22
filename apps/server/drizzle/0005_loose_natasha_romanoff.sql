CREATE TABLE "gtd_sync_clocks" (
	"user_id" text PRIMARY KEY NOT NULL,
	"clock" bigint DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gtd_sync_mutations" (
	"user_id" text NOT NULL,
	"mutation_id" text NOT NULL,
	"sync_id" bigint,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gtd_sync_mutations_user_id_mutation_id_pk" PRIMARY KEY("user_id","mutation_id")
);
--> statement-breakpoint
ALTER TABLE "gtd_attachments" ADD COLUMN "user_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "gtd_attachments" ADD COLUMN "sync_id" bigint;--> statement-breakpoint
ALTER TABLE "gtd_attachments" ADD COLUMN "deleted" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "gtd_folders" ADD COLUMN "sync_id" bigint;--> statement-breakpoint
ALTER TABLE "gtd_folders" ADD COLUMN "deleted" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "gtd_perspectives" ADD COLUMN "sync_id" bigint;--> statement-breakpoint
ALTER TABLE "gtd_perspectives" ADD COLUMN "deleted" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "gtd_projects" ADD COLUMN "sync_id" bigint;--> statement-breakpoint
ALTER TABLE "gtd_projects" ADD COLUMN "deleted" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "gtd_tags" ADD COLUMN "sync_id" bigint;--> statement-breakpoint
ALTER TABLE "gtd_tags" ADD COLUMN "deleted" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "gtd_task_tags" ADD COLUMN "user_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "gtd_task_tags" ADD COLUMN "sync_id" bigint;--> statement-breakpoint
ALTER TABLE "gtd_task_tags" ADD COLUMN "deleted" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "gtd_task_tags" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "gtd_tasks" ADD COLUMN "sync_id" bigint;--> statement-breakpoint
ALTER TABLE "gtd_tasks" ADD COLUMN "deleted" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_gtd_attachments_user_syncid" ON "gtd_attachments" USING btree ("user_id","sync_id");--> statement-breakpoint
CREATE INDEX "idx_gtd_folders_user_syncid" ON "gtd_folders" USING btree ("user_id","sync_id");--> statement-breakpoint
CREATE INDEX "idx_gtd_perspectives_user_syncid" ON "gtd_perspectives" USING btree ("user_id","sync_id");--> statement-breakpoint
CREATE INDEX "idx_gtd_projects_user_syncid" ON "gtd_projects" USING btree ("user_id","sync_id");--> statement-breakpoint
CREATE INDEX "idx_gtd_tags_user_syncid" ON "gtd_tags" USING btree ("user_id","sync_id");--> statement-breakpoint
CREATE INDEX "idx_gtd_task_tags_user_syncid" ON "gtd_task_tags" USING btree ("user_id","sync_id");--> statement-breakpoint
CREATE INDEX "idx_gtd_tasks_user_syncid" ON "gtd_tasks" USING btree ("user_id","sync_id");