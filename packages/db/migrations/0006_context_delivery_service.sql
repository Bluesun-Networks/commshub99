ALTER TABLE `contact_contexts` ADD `delivery_service` text DEFAULT 'auto' NOT NULL;
--> statement-breakpoint
ALTER TABLE `conversation_contexts` ADD `delivery_service` text DEFAULT 'inherit' NOT NULL;
