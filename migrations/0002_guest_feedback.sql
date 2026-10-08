CREATE TABLE `feedback` (
	`id` text PRIMARY KEY NOT NULL,
	`stay_id` text NOT NULL,
	`room_id` text NOT NULL,
	`rating` integer,
	`liked` text DEFAULT '[]' NOT NULL,
	`disliked` text DEFAULT '[]' NOT NULL,
	`comment` text,
	`email` text,
	`wants_receipt` integer DEFAULT false NOT NULL,
	`marketing` integer DEFAULT false NOT NULL,
	`marketing_at` integer,
	`lang` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`stay_id`) REFERENCES `stays`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "feedback_rating_range" CHECK("feedback"."rating" IS NULL OR ("feedback"."rating" BETWEEN 1 AND 5))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `feedback_stay_id_unique` ON `feedback` (`stay_id`);--> statement-breakpoint
CREATE INDEX `feedback_created_idx` ON `feedback` (`created_at`);--> statement-breakpoint
ALTER TABLE `stays` ADD `source` text DEFAULT '' NOT NULL;