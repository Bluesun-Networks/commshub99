CREATE TABLE `context_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`context_type` text NOT NULL,
	`context_id` text NOT NULL,
	`operation` text NOT NULL,
	`actor_user_id` text,
	`before_json` text,
	`after_json` text,
	`source` text DEFAULT 'human' NOT NULL,
	`confidence` real,
	`review_status` text DEFAULT 'approved' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `context_versions_context_idx` ON `context_versions` (`tenant_id`,`context_type`,`context_id`);--> statement-breakpoint
CREATE INDEX `context_versions_review_idx` ON `context_versions` (`tenant_id`,`review_status`);--> statement-breakpoint
CREATE INDEX `context_versions_actor_idx` ON `context_versions` (`actor_user_id`);