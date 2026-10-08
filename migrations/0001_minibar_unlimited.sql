ALTER TABLE `products` ADD `unlimited` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `alert_at` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
-- Comportement d’avant conservé : « stock bas » à 2 articles ou moins.
UPDATE `products` SET `alert_at` = 2;
