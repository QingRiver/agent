CREATE TABLE "skills" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"dir_id" text NOT NULL,
	"code" text NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	CONSTRAINT "ck_skills_status" CHECK (status IN ('usable', 'offline'))
);--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_skills_dir_id" ON "skills" USING btree ("dir_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_skills_user_code" ON "skills" USING btree ("user_id","code");--> statement-breakpoint
CREATE INDEX "idx_skills_user" ON "skills" USING btree ("user_id");--> statement-breakpoint
CREATE TABLE "version_text" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"mount_dir_id" text NOT NULL,
	"filename" text NOT NULL,
	"content" text NOT NULL,
	"updated_at" timestamp with time zone
);--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_version_text_user_mount_filename" ON "version_text" USING btree ("user_id","mount_dir_id","filename");--> statement-breakpoint
CREATE INDEX "idx_version_text_user_mount" ON "version_text" USING btree ("user_id","mount_dir_id");--> statement-breakpoint
CREATE TABLE "skill_tags" (
	"skill_id" text NOT NULL,
	"tag_id" text NOT NULL,
	CONSTRAINT "skill_tags_pkey" PRIMARY KEY("skill_id","tag_id")
);--> statement-breakpoint
CREATE INDEX "idx_skill_tags_tag" ON "skill_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE INDEX "idx_skill_tags_skill" ON "skill_tags" USING btree ("skill_id");
