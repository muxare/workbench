CREATE TABLE `cards` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`function_id` text NOT NULL,
	`owner` text NOT NULL,
	`milestone` text,
	`links` text NOT NULL,
	FOREIGN KEY (`owner`) REFERENCES `teammates`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `cycles` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`starts_at` text NOT NULL,
	`ends_at` text NOT NULL,
	`starts_at_ms` integer NOT NULL,
	`ends_at_ms` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `events` (
	`seq` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`id` text NOT NULL,
	`card_id` text NOT NULL,
	`type` text NOT NULL,
	`actor` text NOT NULL,
	`at` text NOT NULL,
	`at_ms` integer NOT NULL,
	`payload` text NOT NULL,
	FOREIGN KEY (`card_id`) REFERENCES `cards`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor`) REFERENCES `teammates`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `events_id_unique` ON `events` (`id`);--> statement-breakpoint
CREATE INDEX `events_card_seq` ON `events` (`card_id`,`seq`);--> statement-breakpoint
CREATE INDEX `events_at_ms` ON `events` (`at_ms`);--> statement-breakpoint
CREATE TABLE `teammates` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`process_profile` text
);
