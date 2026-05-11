CREATE TABLE `tenant_settings` (
	`tenant_id` text PRIMARY KEY NOT NULL,
	`signature` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `contact_contexts` ADD `signature_mode` text DEFAULT 'inherit' NOT NULL;
--> statement-breakpoint
ALTER TABLE `contact_contexts` ADD `signature_value` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `conversation_contexts` ADD `signature_mode` text DEFAULT 'inherit' NOT NULL;
--> statement-breakpoint
ALTER TABLE `conversation_contexts` ADD `signature_value` text DEFAULT '' NOT NULL;
