CREATE TABLE `orders` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`kind` text NOT NULL,
	`details` text NOT NULL,
	`amount` integer NOT NULL,
	`currency` text DEFAULT 'EUR' NOT NULL,
	`status` text DEFAULT 'PENDING_PAYMENT' NOT NULL,
	`link_id` text,
	`pay_url` text,
	`expires_at` integer NOT NULL,
	`paid_at` integer,
	`refunded_at` integer,
	`request_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`request_id`) REFERENCES `requests`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `orders_status_expires_idx` ON `orders` (`status`,`expires_at`);--> statement-breakpoint
CREATE INDEX `orders_room_created_idx` ON `orders` (`room_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `orders_created_idx` ON `orders` (`created_at`);