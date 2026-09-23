CREATE TABLE `documents` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`created` integer NOT NULL,
	`actor` text NOT NULL,
	`note` text NOT NULL,
	`summary` text NOT NULL,
	`revenue` integer DEFAULT 0 NOT NULL,
	`fingerprint` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_documents_created` ON `documents` (`created`);--> statement-breakpoint
CREATE TABLE `movements` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`document_id` text NOT NULL,
	`product_id` text NOT NULL,
	`quantity` integer NOT NULL,
	`cost` integer NOT NULL,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_movements_document` ON `movements` (`document_id`);--> statement-breakpoint
CREATE TABLE `parts` (
	`recipe_id` text NOT NULL,
	`product_id` text NOT NULL,
	`quantity` integer NOT NULL,
	PRIMARY KEY(`recipe_id`, `product_id`),
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `products` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`stock` integer DEFAULT 0 NOT NULL,
	`cost` integer DEFAULT 0 NOT NULL,
	`price` integer NOT NULL,
	`minimum` integer DEFAULT 5 NOT NULL,
	CONSTRAINT "stock_nonnegative" CHECK("products"."stock" >= 0)
);
--> statement-breakpoint
CREATE TABLE `recipes` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`price` integer NOT NULL
);
