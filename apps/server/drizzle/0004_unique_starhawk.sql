CREATE TABLE "agent_configs" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"user_prompt" text NOT NULL,
	"kb_id" text NOT NULL,
	"max_steps" integer NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_agent_configs_user_updated" ON "agent_configs" USING btree ("user_id","updated_at");