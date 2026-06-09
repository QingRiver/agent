CREATE TABLE `conversation_messages` (
	`thread_id` text PRIMARY KEY NOT NULL,
	`messages` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `conversation_threads` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`agent_id` text NOT NULL,
	`title` text NOT NULL,
	`pinned` integer DEFAULT 0 NOT NULL,
	`seq` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_conv_user_list` ON `conversation_threads` (`user_id`,`pinned`,`updated_at`);