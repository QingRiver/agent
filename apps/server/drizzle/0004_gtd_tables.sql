CREATE TABLE "gtd_attachments" (
	"id" text PRIMARY KEY NOT NULL,
	"task_id" text NOT NULL,
	"kind" text NOT NULL,
	"url" text NOT NULL,
	"filename" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gtd_folders" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"parent_id" text,
	"name" text NOT NULL,
	"sort_order" double precision NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "gtd_perspectives" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"icon" text,
	"filter" jsonb,
	"group_by" text[] DEFAULT '{}' NOT NULL,
	"sort_by" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"availability_filter" text DEFAULT 'available' NOT NULL,
	"show_completed" boolean DEFAULT false NOT NULL,
	"show_dropped" boolean DEFAULT false NOT NULL,
	"flagged_only" boolean,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "gtd_projects" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"folder_id" text,
	"name" text NOT NULL,
	"note" text,
	"sort_order" double precision NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"type" text NOT NULL,
	"default_defer_offset" integer,
	"default_due_offset" integer,
	"default_tag_ids" text[],
	"flagged" boolean DEFAULT false NOT NULL,
	"review" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"next_review_date" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "gtd_tags" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"parent_id" text,
	"name" text NOT NULL,
	"color" text,
	"sort_order" double precision NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "gtd_task_tags" (
	"task_id" text NOT NULL,
	"tag_id" text NOT NULL,
	CONSTRAINT "gtd_task_tags_task_id_tag_id_pk" PRIMARY KEY("task_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "gtd_tasks" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"project_id" text,
	"parent_id" text,
	"name" text NOT NULL,
	"note" text,
	"sort_order" double precision NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"group_type" text,
	"defer_date" timestamp with time zone,
	"due_date" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"dropped_at" timestamp with time zone,
	"flagged" boolean DEFAULT false NOT NULL,
	"estimate_minutes" integer,
	"repeat_rule" jsonb,
	"repeated_from_task_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	CONSTRAINT "ck_gtd_tasks_inbox" CHECK (((project_id IS NULL AND parent_id IS NULL) OR project_id IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "gtd_attachments" ADD CONSTRAINT "gtd_attachments_task_id_gtd_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."gtd_tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gtd_folders" ADD CONSTRAINT "gtd_folders_parent_id_gtd_folders_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."gtd_folders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gtd_projects" ADD CONSTRAINT "gtd_projects_folder_id_gtd_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."gtd_folders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gtd_tags" ADD CONSTRAINT "gtd_tags_parent_id_gtd_tags_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."gtd_tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gtd_task_tags" ADD CONSTRAINT "gtd_task_tags_task_id_gtd_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."gtd_tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gtd_task_tags" ADD CONSTRAINT "gtd_task_tags_tag_id_gtd_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."gtd_tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gtd_tasks" ADD CONSTRAINT "gtd_tasks_project_id_gtd_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."gtd_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gtd_tasks" ADD CONSTRAINT "gtd_tasks_parent_id_gtd_tasks_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."gtd_tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_gtd_attachments_task" ON "gtd_attachments" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "idx_gtd_folders_user_parent" ON "gtd_folders" USING btree ("user_id","parent_id");--> statement-breakpoint
CREATE INDEX "idx_gtd_folders_user_sort" ON "gtd_folders" USING btree ("user_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_gtd_perspectives_user_name" ON "gtd_perspectives" USING btree ("user_id","name");--> statement-breakpoint
CREATE INDEX "idx_gtd_projects_user_folder" ON "gtd_projects" USING btree ("user_id","folder_id");--> statement-breakpoint
CREATE INDEX "idx_gtd_projects_user_status_sort" ON "gtd_projects" USING btree ("user_id","status","sort_order");--> statement-breakpoint
CREATE INDEX "idx_gtd_projects_user_review" ON "gtd_projects" USING btree ("user_id") WHERE next_review_date IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_gtd_tags_user_parent" ON "gtd_tags" USING btree ("user_id","parent_id");--> statement-breakpoint
CREATE INDEX "idx_gtd_task_tags_tag" ON "gtd_task_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE INDEX "idx_gtd_tasks_user_proj_parent_sort" ON "gtd_tasks" USING btree ("user_id","project_id","parent_id","sort_order");--> statement-breakpoint
CREATE INDEX "idx_gtd_tasks_user_status" ON "gtd_tasks" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "idx_gtd_tasks_user_parent" ON "gtd_tasks" USING btree ("user_id","parent_id");--> statement-breakpoint
CREATE INDEX "idx_gtd_tasks_user_due" ON "gtd_tasks" USING btree ("user_id","due_date") WHERE due_date IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_gtd_tasks_user_defer" ON "gtd_tasks" USING btree ("user_id","defer_date") WHERE defer_date IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_gtd_tasks_user_flagged" ON "gtd_tasks" USING btree ("user_id") WHERE flagged = true;--> statement-breakpoint
-- gtd: 自/互引用 FK 改 DEFERRABLE INITIALLY DEFERRED（saveDocument 全量 upsert 免拓扑排序，容忍导入临时环，提交前由 invariant 拦截）
ALTER TABLE "gtd_folders" ALTER CONSTRAINT "gtd_folders_parent_id_gtd_folders_id_fk" DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "gtd_tags" ALTER CONSTRAINT "gtd_tags_parent_id_gtd_tags_id_fk" DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "gtd_tasks" ALTER CONSTRAINT "gtd_tasks_project_id_gtd_projects_id_fk" DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "gtd_tasks" ALTER CONSTRAINT "gtd_tasks_parent_id_gtd_tasks_id_fk" DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "gtd_projects" ALTER CONSTRAINT "gtd_projects_folder_id_gtd_folders_id_fk" DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "gtd_task_tags" ALTER CONSTRAINT "gtd_task_tags_task_id_gtd_tasks_id_fk" DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "gtd_task_tags" ALTER CONSTRAINT "gtd_task_tags_tag_id_gtd_tags_id_fk" DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "gtd_attachments" ALTER CONSTRAINT "gtd_attachments_task_id_gtd_tasks_id_fk" DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
-- gtd: 同级不重名（PG 中 NULL≠NULL，COALESCE 归一）
CREATE UNIQUE INDEX "uniq_gtd_folders_parent_name" ON "gtd_folders" ("user_id", COALESCE("parent_id", ''), "name");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_gtd_tags_parent_name" ON "gtd_tags" ("user_id", COALESCE("parent_id", ''), "name");--> statement-breakpoint
-- gtd: BRIN 时序索引（创建时间排序/分页，体积远小于 btree）
CREATE INDEX "idx_gtd_tasks_user_created_brin" ON "gtd_tasks" USING brin ("user_id", "created_at");