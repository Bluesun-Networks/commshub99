CREATE TABLE `contact_contexts` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`contact_key` text NOT NULL,
	`display_name` text DEFAULT '' NOT NULL,
	`relationship` text DEFAULT 'unknown' NOT NULL,
	`tone` text DEFAULT 'warm' NOT NULL,
	`reply_posture` text DEFAULT 'reply_if_needed' NOT NULL,
	`custom_prompt` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`allowed_personal_details_json` text DEFAULT '[]' NOT NULL,
	`custom_personal_details_json` text DEFAULT '[]' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `contact_contexts_tenant_contact_key_unique` ON `contact_contexts` (`tenant_id`,`contact_key`);--> statement-breakpoint
CREATE INDEX `contact_contexts_tenant_relationship_idx` ON `contact_contexts` (`tenant_id`,`relationship`);--> statement-breakpoint
CREATE TABLE `conversation_contexts` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`channel_id` text NOT NULL,
	`room_key` text NOT NULL,
	`display_name` text DEFAULT '' NOT NULL,
	`relationship` text DEFAULT 'unknown' NOT NULL,
	`tone` text DEFAULT 'warm' NOT NULL,
	`reply_posture` text DEFAULT 'reply_if_needed' NOT NULL,
	`custom_prompt` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`allowed_personal_details_json` text DEFAULT '[]' NOT NULL,
	`custom_personal_details_json` text DEFAULT '[]' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `conversation_contexts_tenant_room_unique` ON `conversation_contexts` (`tenant_id`,`channel_id`,`room_key`);--> statement-breakpoint
CREATE INDEX `conversation_contexts_tenant_channel_idx` ON `conversation_contexts` (`tenant_id`,`channel_id`);