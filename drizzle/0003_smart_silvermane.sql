CREATE TABLE `local_sales` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`sale_date` text NOT NULL,
	`area` text NOT NULL,
	`concept` text NOT NULL,
	`amount` real NOT NULL,
	`notes` text,
	`created_by_email` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `operating_expenses` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`expense_date` text NOT NULL,
	`area` text NOT NULL,
	`category` text NOT NULL,
	`concept` text NOT NULL,
	`amount` real NOT NULL,
	`notes` text,
	`created_by_email` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
