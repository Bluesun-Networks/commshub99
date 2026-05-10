CREATE TABLE `scheduled_sends` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`draft_id` text NOT NULL,
	`channel_id` text NOT NULL,
	`send_at` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`last_error` text,
	`requested_by_user_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`requested_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `scheduled_sends_tenant_status_send_at_idx` ON `scheduled_sends` (`tenant_id`,`status`,`send_at`);--> statement-breakpoint
CREATE INDEX `scheduled_sends_draft_id_idx` ON `scheduled_sends` (`draft_id`);--> statement-breakpoint
CREATE INDEX `scheduled_sends_requested_by_user_id_idx` ON `scheduled_sends` (`requested_by_user_id`);