CREATE TABLE "kb_nodes" (
	"id" text PRIMARY KEY NOT NULL,
	"kb_id" text NOT NULL,
	"parent_id" text,
	"name" text NOT NULL,
	"owner" text,
	"visibility" text DEFAULT 'private' NOT NULL,
	"permissions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kb_documents" (
	"id" text PRIMARY KEY NOT NULL,
	"kb_id" text NOT NULL,
	"parent_node_id" text,
	"name" text NOT NULL,
	"filename" text,
	"vdir" text,
	"content" text DEFAULT '' NOT NULL,
	"draft_hash" text,
	"published_hash" text,
	"owner" text,
	"summary" text,
	"keywords" text[],
	"toc" text[],
	"visibility" text DEFAULT 'private' NOT NULL,
	"permissions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"indexing_status" text DEFAULT 'draft' NOT NULL,
	"error" text,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	"indexed_at" bigint
);
--> statement-breakpoint
CREATE TABLE "kb_chunks" (
	"id" text PRIMARY KEY NOT NULL,
	"doc_id" text NOT NULL,
	"position" integer NOT NULL,
	"content" text NOT NULL,
	"heading_path" text[],
	"page_number" integer,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kb_doc_tags" (
	"doc_id" text NOT NULL,
	"tag_id" text NOT NULL,
	CONSTRAINT "kb_doc_tags_doc_id_tag_id_pk" PRIMARY KEY("doc_id","tag_id")
);
--> statement-breakpoint
ALTER TABLE "kb_nodes" ADD CONSTRAINT "kb_nodes_parent_id_kb_nodes_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."kb_nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kb_documents" ADD CONSTRAINT "kb_documents_parent_node_id_kb_nodes_id_fk" FOREIGN KEY ("parent_node_id") REFERENCES "public"."kb_nodes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kb_chunks" ADD CONSTRAINT "kb_chunks_doc_id_kb_documents_id_fk" FOREIGN KEY ("doc_id") REFERENCES "public"."kb_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kb_doc_tags" ADD CONSTRAINT "kb_doc_tags_doc_id_kb_documents_id_fk" FOREIGN KEY ("doc_id") REFERENCES "public"."kb_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kb_doc_tags" ADD CONSTRAINT "kb_doc_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_kb_nodes_kb_parent" ON "kb_nodes" USING btree ("kb_id","parent_id");--> statement-breakpoint
CREATE INDEX "idx_kb_nodes_owner" ON "kb_nodes" USING btree ("kb_id","owner");--> statement-breakpoint
CREATE INDEX "idx_kb_docs_kb_owner" ON "kb_documents" USING btree ("kb_id","owner");--> statement-breakpoint
CREATE INDEX "idx_kb_docs_kb_parent" ON "kb_documents" USING btree ("kb_id","parent_node_id");--> statement-breakpoint
CREATE INDEX "idx_kb_docs_kb_vdir" ON "kb_documents" USING btree ("kb_id","vdir");--> statement-breakpoint
CREATE INDEX "idx_kb_docs_kb_list" ON "kb_documents" USING btree ("kb_id","pinned","updated_at");--> statement-breakpoint
CREATE INDEX "idx_kb_chunks_doc" ON "kb_chunks" USING btree ("doc_id");--> statement-breakpoint
CREATE INDEX "idx_kb_doc_tags_tag" ON "kb_doc_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_kb_nodes_parent_name" ON "kb_nodes" ("kb_id", (COALESCE("parent_id", '')), "name");
