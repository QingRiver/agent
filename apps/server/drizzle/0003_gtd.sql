CREATE TABLE "gtd_attachments" (
	"id" text PRIMARY KEY NOT NULL,
	"task_id" text NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"url" text NOT NULL,
	"filename" text NOT NULL,
	"sync_id" bigint,
	"deleted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "gtd_perspectives" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"icon" text,
	"filter" jsonb,
	"group_by" text[] DEFAULT '{}' NOT NULL,
	"sort_by" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sync_id" bigint,
	"deleted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);--> statement-breakpoint
CREATE TABLE "gtd_sync_clocks" (
	"user_id" text PRIMARY KEY NOT NULL,
	"clock" bigint DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "gtd_sync_mutations" (
	"user_id" text NOT NULL,
	"mutation_id" text NOT NULL,
	"sync_id" bigint,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gtd_sync_mutations_user_id_mutation_id_pk" PRIMARY KEY("user_id","mutation_id")
);--> statement-breakpoint
CREATE TABLE "gtd_task_tags" (
	"task_id" text NOT NULL,
	"tag_id" text NOT NULL,
	"user_id" text NOT NULL,
	"sync_id" bigint,
	"deleted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gtd_task_tags_task_id_tag_id_pk" PRIMARY KEY("task_id","tag_id")
);--> statement-breakpoint
CREATE TABLE "gtd_tasks" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"mount_dir_id" text,
	"parent_id" text,
	"name" text NOT NULL,
	"note" text,
	"sort_order" double precision NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"group_type" text,
	"defer_date" timestamp with time zone,
	"due_date" timestamp with time zone,
	"planned_mode" text DEFAULT 'none' NOT NULL,
	"planned_date" timestamp with time zone,
	"completed_at" timestamp with time zone,
	-- held_at = 搁置；dropped_at = 进回收站（互不共用）
	"held_at" timestamp with time zone,
	"dropped_at" timestamp with time zone,
	"flagged" boolean DEFAULT false NOT NULL,
	"estimate_minutes" integer,
	"repeat_rule" jsonb,
	"repeated_from_task_id" text,
	"sync_id" bigint,
	"deleted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	CONSTRAINT "ck_gtd_tasks_inbox" CHECK (((mount_dir_id IS NULL AND parent_id IS NULL) OR mount_dir_id IS NOT NULL))
);--> statement-breakpoint
ALTER TABLE "gtd_attachments" ADD CONSTRAINT "gtd_attachments_task_id_gtd_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."gtd_tasks"("id") ON DELETE cascade ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "gtd_task_tags" ADD CONSTRAINT "gtd_task_tags_task_id_gtd_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."gtd_tasks"("id") ON DELETE cascade ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "gtd_task_tags" ADD CONSTRAINT "gtd_task_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "gtd_tasks" ADD CONSTRAINT "gtd_tasks_parent_id_gtd_tasks_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."gtd_tasks"("id") ON DELETE cascade ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
CREATE INDEX "idx_gtd_attachments_task" ON "gtd_attachments" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "idx_gtd_attachments_user_syncid" ON "gtd_attachments" USING btree ("user_id","sync_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_gtd_perspectives_user_name" ON "gtd_perspectives" USING btree ("user_id","name");--> statement-breakpoint
CREATE INDEX "idx_gtd_perspectives_user_syncid" ON "gtd_perspectives" USING btree ("user_id","sync_id");--> statement-breakpoint
CREATE INDEX "idx_gtd_task_tags_tag" ON "gtd_task_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE INDEX "idx_gtd_task_tags_user_syncid" ON "gtd_task_tags" USING btree ("user_id","sync_id");--> statement-breakpoint
CREATE INDEX "idx_gtd_tasks_user_mount_parent_sort" ON "gtd_tasks" USING btree ("user_id","mount_dir_id","parent_id","sort_order");--> statement-breakpoint
CREATE INDEX "idx_gtd_tasks_user_mount" ON "gtd_tasks" USING btree ("user_id","mount_dir_id");--> statement-breakpoint
CREATE INDEX "idx_gtd_tasks_user_status" ON "gtd_tasks" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "idx_gtd_tasks_user_parent" ON "gtd_tasks" USING btree ("user_id","parent_id");--> statement-breakpoint
CREATE INDEX "idx_gtd_tasks_user_due" ON "gtd_tasks" USING btree ("user_id","due_date") WHERE due_date IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_gtd_tasks_user_defer" ON "gtd_tasks" USING btree ("user_id","defer_date") WHERE defer_date IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_gtd_tasks_user_flagged" ON "gtd_tasks" USING btree ("user_id") WHERE flagged = true;--> statement-breakpoint
CREATE INDEX "idx_gtd_tasks_user_syncid" ON "gtd_tasks" USING btree ("user_id","sync_id");--> statement-breakpoint
CREATE INDEX "idx_gtd_tasks_user_created_brin" ON "gtd_tasks" USING brin ("user_id", "created_at");--> statement-breakpoint
