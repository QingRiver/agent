CREATE TABLE "dirs" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"parent_id" text,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"sort_order" double precision NOT NULL,
	"project_id" text NOT NULL,
	"vdir" text NOT NULL,
	"acl" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"owner_id" text NOT NULL,
	"etag" integer DEFAULT 1 NOT NULL,
	"deleted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	CONSTRAINT "ck_dirs_kind" CHECK (kind IN ('project', 'dir')),
	CONSTRAINT "ck_dirs_project_root" CHECK ((kind = 'project' AND parent_id IS NULL) OR kind = 'dir')
);--> statement-breakpoint
ALTER TABLE "dirs" ADD CONSTRAINT "dirs_parent_id_dirs_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."dirs"("id") ON DELETE restrict ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "dirs" ADD CONSTRAINT "dirs_project_id_dirs_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."dirs"("id") ON DELETE restrict ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
CREATE INDEX "idx_dirs_user_project" ON "dirs" USING btree ("user_id","project_id");--> statement-breakpoint
CREATE INDEX "idx_dirs_user_parent" ON "dirs" USING btree ("user_id","parent_id");--> statement-breakpoint
CREATE INDEX "idx_dirs_user_owner" ON "dirs" USING btree ("user_id","owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_dirs_parent_name" ON "dirs" ("user_id", COALESCE("parent_id", ''), "name") WHERE "deleted" = false;--> statement-breakpoint
