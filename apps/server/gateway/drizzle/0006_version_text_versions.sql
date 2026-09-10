ALTER TABLE "version_text" ADD COLUMN "type" text DEFAULT 'skill' NOT NULL;--> statement-breakpoint
ALTER TABLE "version_text" ADD COLUMN "version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "version_text" ADD COLUMN "version_desc" text;--> statement-breakpoint
ALTER TABLE "version_text" ADD COLUMN "published_at" timestamp with time zone;--> statement-breakpoint
DROP INDEX IF EXISTS "uniq_version_text_user_mount_filename";--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_version_text_user_mount_filename_version" ON "version_text" USING btree ("user_id","mount_dir_id","filename","version");--> statement-breakpoint
CREATE INDEX "idx_version_text_user_mount_filename" ON "version_text" USING btree ("user_id","mount_dir_id","filename");--> statement-breakpoint
ALTER TABLE "version_text" ADD CONSTRAINT "ck_version_text_type" CHECK (type IN ('skill', 'prompt', 'config'));--> statement-breakpoint
ALTER TABLE "version_text" ADD CONSTRAINT "ck_version_text_version_nonneg" CHECK (version >= 0);
