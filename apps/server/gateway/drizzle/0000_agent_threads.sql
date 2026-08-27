CREATE TABLE "agent_configs" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"user_prompt" text NOT NULL,
	"kb_id" text NOT NULL,
	"max_steps" integer NOT NULL,
	"skill_codes" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);--> statement-breakpoint
CREATE TABLE "conversation_threads" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"agent_id" text NOT NULL,
	"title" text NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"seq" integer NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);--> statement-breakpoint
CREATE INDEX "idx_agent_configs_user_updated" ON "agent_configs" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_conv_user_list" ON "conversation_threads" USING btree ("user_id","pinned","updated_at");--> statement-breakpoint
