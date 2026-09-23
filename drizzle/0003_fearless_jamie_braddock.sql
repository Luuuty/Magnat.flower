ALTER TABLE `documents` ADD `reverse_of` text;--> statement-breakpoint
ALTER TABLE `documents` ADD `expense` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `documents` ADD `effect_cost` integer;--> statement-breakpoint
ALTER TABLE `documents` ADD `effect_loss` integer;--> statement-breakpoint
ALTER TABLE `documents` ADD `effect_purchases` integer;--> statement-breakpoint
CREATE UNIQUE INDEX `documents_reverse_of_unique` ON `documents` (`reverse_of`);